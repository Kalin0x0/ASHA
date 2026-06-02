import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { LoginDto } from '@chista/contracts';
import { hashToken, randomToken, verifyPassword } from '@chista/crypto';
import { prisma } from '@chista/db';
import type { Env } from '@chista/config';
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

    const requires2fa = user.twoFactorMethods.some((m) => m.confirmed);
    if (requires2fa && !dto.totp) {
      throw new UnauthorizedException('Two-factor code required');
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
      include: { groups: { include: { group: true } } },
    });
    if (!user) throw new UnauthorizedException();
    const permissions = [...(await this.rbac.effectivePermissions(userId))];
    return {
      ...this.publicUser(user),
      groups: user.groups.map((g) => g.group.name),
      permissions,
    };
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
