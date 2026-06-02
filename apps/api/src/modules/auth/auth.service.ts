import { BadRequestException, Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { ConfirmTotpDto, LoginDto } from '@chista/contracts';
import { hashToken, randomToken, verifyPassword } from '@chista/crypto';
import { prisma } from '@chista/db';
import type { Env } from '@chista/config';
import { generateSecret, generateURI, verify as verifyOtp } from 'otplib';
import qrcode from 'qrcode';
import { AuditService } from '../../common/audit.service';
import { ENV } from '../../common/env.module';
import { RbacService } from '../../common/rbac.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwt: JwtService,
    private readonly rbac: RbacService,
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async login(dto: LoginDto, ip?: string, userAgent?: string) {
    const user = await prisma.user.findFirst({
      where: { OR: [{ email: dto.email }, { username: dto.email }] },
      include: { credentials: true, twoFactorMethods: true },
    });
    if (!user || user.status !== 'ACTIVE') throw new UnauthorizedException('Invalid credentials');

    const cred = user.credentials.find((c) => c.kind === 'PASSWORD');
    if (!cred || !(await verifyPassword(dto.password, cred.secret))) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const confirmedTotp = user.twoFactorMethods.find((m) => m.confirmed && m.type === 'TOTP');
    if (confirmedTotp) {
      if (!dto.totp) throw new UnauthorizedException('Two-factor code required');

      // Replay protection: reject if the same 30-second window was already used.
      // lastUsedAt represents the last successful verification; if it falls within
      // the current TOTP period, the code has already been consumed.
      const TOTP_PERIOD_MS = 30_000;
      if (confirmedTotp.lastUsedAt) {
        const windowStart = Math.floor(Date.now() / TOTP_PERIOD_MS) * TOTP_PERIOD_MS;
        if (confirmedTotp.lastUsedAt.getTime() >= windowStart) {
          throw new UnauthorizedException('Two-factor code already used — wait for the next code');
        }
      }

      const result = await verifyOtp({ secret: confirmedTotp.secret, token: dto.totp });
      if (!result.valid) throw new UnauthorizedException('Invalid two-factor code');
      await prisma.twoFactorMethod.update({
        where: { id: confirmedTotp.id },
        data: { lastUsedAt: new Date() },
      });
    }

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await this.audit.record({
      orgId: user.orgId,
      actorUserId: user.id,
      action: 'auth.login',
      ip,
      userAgent,
    });

    const tokens = await this.issueTokens(user);
    return { ...tokens, user: this.publicUser(user) };
  }

  async refresh(refreshToken: string) {
    let payload: { sub: string };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, { secret: this.env.JWT_REFRESH_SECRET });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const stored = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(refreshToken) } });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token revoked or expired');
    }
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.status !== 'ACTIVE') throw new UnauthorizedException('User unavailable');

    await prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
    return this.issueTokens(user);
  }

  async logout(userId: string, refreshToken?: string) {
    if (refreshToken) {
      await prisma.refreshToken.updateMany({
        where: { userId, tokenHash: hashToken(refreshToken) },
        data: { revokedAt: new Date() },
      });
    }
    return { ok: true };
  }

  async me(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { groups: { include: { group: true } }, twoFactorMethods: { where: { confirmed: true } } },
    });
    if (!user) throw new UnauthorizedException();
    const permissions = [...(await this.rbac.effectivePermissions(userId))];
    return {
      ...this.publicUser(user),
      groups: user.groups.map((g) => g.group.name),
      permissions,
      twoFactor: { enabled: user.twoFactorMethods.length > 0 },
    };
  }

  /** Step 1: Generate a new TOTP secret and return the OTP URI + QR code data URL. */
  async enrollTotp(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const secret = generateSecret();
    const otpUri = generateURI({ issuer: 'Chista', label: user.email, secret });
    const qrDataUrl = await qrcode.toDataURL(otpUri);

    const method = await prisma.twoFactorMethod.create({
      data: {
        userId,
        type: 'TOTP',
        label: 'Authenticator app',
        secret,
        confirmed: false,
      },
    });

    return { methodId: method.id, otpUri, qrDataUrl };
  }

  /** Step 2: Verify the first code and mark the method as confirmed. */
  async confirmTotp(userId: string, dto: ConfirmTotpDto) {
    const method = await prisma.twoFactorMethod.findFirst({
      where: { id: dto.methodId, userId, type: 'TOTP', confirmed: false },
    });
    if (!method) throw new NotFoundException('Pending TOTP enrollment not found');

    const result = await verifyOtp({ secret: method.secret, token: dto.code });
    if (!result.valid) throw new BadRequestException('Invalid TOTP code');

    await prisma.twoFactorMethod.update({
      where: { id: method.id },
      data: { confirmed: true, lastUsedAt: new Date() },
    });
    return { ok: true };
  }

  /** Remove all TOTP methods from a user account. */
  async disableTotp(userId: string) {
    await prisma.twoFactorMethod.deleteMany({ where: { userId, type: 'TOTP' } });
    return { ok: true };
  }

  private async issueTokens(user: { id: string; orgId: string; email: string; isSystemAdmin: boolean }) {
    const payload = {
      sub: user.id,
      orgId: user.orgId,
      email: user.email,
      isSystemAdmin: user.isSystemAdmin,
    };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.env.JWT_ACCESS_SECRET,
      expiresIn: this.env.JWT_ACCESS_TTL,
    });
    const refreshToken = await this.jwt.signAsync(
      { sub: user.id },
      { secret: this.env.JWT_REFRESH_SECRET, expiresIn: this.env.JWT_REFRESH_TTL },
    );
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        family: randomToken(8),
        expiresAt: new Date(Date.now() + this.env.JWT_REFRESH_TTL * 1000),
      },
    });
    return { accessToken, refreshToken, expiresIn: this.env.JWT_ACCESS_TTL, tokenType: 'Bearer' };
  }

  private publicUser(user: {
    id: string;
    email: string;
    username: string;
    displayName: string | null;
    orgId: string;
    isSystemAdmin: boolean;
  }) {
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      orgId: user.orgId,
      isSystemAdmin: user.isSystemAdmin,
    };
  }
}
