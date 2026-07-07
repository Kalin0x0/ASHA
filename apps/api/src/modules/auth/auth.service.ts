import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { ConfirmTotpDto, LoginDto } from '@asha/contracts';
import { hashToken, randomToken, verifyPassword } from '@asha/crypto';
import { prisma } from '@asha/db';
import type { Env } from '@asha/config';
import { generateSecret, generateURI, verify as verifyOtp } from 'otplib';
import qrcode from 'qrcode';
import { AuditService } from '../../common/audit.service';
import type { AuthUser } from '../../common/decorators';
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

  /**
   * Issue a session for an already-authenticated user (federated SSO: SAML /
   * OIDC / LDAP). The caller is responsible for verifying the external identity
   * and provisioning the user; this only records the login and mints tokens.
   */
  async issueSession(
    user: { id: string; orgId: string; email: string; username: string; displayName: string | null; isSystemAdmin: boolean },
    method: string,
    ip?: string,
    userAgent?: string,
  ) {
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await this.audit.record({
      orgId: user.orgId,
      actorUserId: user.id,
      action: 'auth.login',
      ip,
      userAgent,
      metadata: { method },
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
    if (!stored) throw new UnauthorizedException('Invalid refresh token');

    // Replay detection: a token that was already rotated (revoked) is being
    // presented again. The legitimate client holds the *successor* token, so a
    // hit here means the token leaked and an attacker is replaying it. Burn the
    // entire rotation family — both the thief's and the victim's tokens — which
    // forces a fresh login and contains the breach.
    if (stored.revokedAt) {
      await prisma.refreshToken.updateMany({
        where: { family: stored.family, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.record({
        orgId: (await prisma.user.findUnique({ where: { id: stored.userId } }))?.orgId ?? 'unknown',
        actorUserId: stored.userId,
        action: 'auth.refresh_replay_detected',
        metadata: { family: stored.family },
      });
      throw new UnauthorizedException('Refresh token reuse detected — all sessions revoked');
    }

    if (stored.expiresAt < new Date()) throw new UnauthorizedException('Refresh token expired');

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.status !== 'ACTIVE') throw new UnauthorizedException('User unavailable');

    await prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
    // Carry the rotation family forward so the full chain stays linked.
    return this.issueTokens(user, stored.family);
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
    const otpUri = generateURI({ issuer: 'Asha', label: user.email, secret });
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

    // Mark confirmed but do NOT stamp lastUsedAt here: that field tracks login
    // replay, and setting it at enrollment would make the very first login in the
    // same 30s window fail the "code already used" replay check.
    await prisma.twoFactorMethod.update({
      where: { id: method.id },
      data: { confirmed: true },
    });
    return { ok: true };
  }

  /** Remove all TOTP methods from a user account. */
  async disableTotp(userId: string) {
    await prisma.twoFactorMethod.deleteMany({ where: { userId, type: 'TOTP' } });
    return { ok: true };
  }

  /**
   * Issue a short-lived access token that acts AS the target user (system-admin
   * only, same org). The token carries an RFC-8693 `act` claim naming the real
   * admin for the audit trail, is capped at 30 min, and gets NO refresh token —
   * so impersonation cannot be silently extended; it simply expires.
   */
  async impersonate(actor: AuthUser, targetUserId: string) {
    if (!actor.isSystemAdmin) throw new ForbiddenException('Only a system admin can impersonate users');
    if (targetUserId === actor.sub) throw new BadRequestException('You cannot impersonate yourself');
    const target = await prisma.user.findFirst({ where: { id: targetUserId, orgId: actor.orgId } });
    if (!target) throw new NotFoundException('User not found');

    const ttl = Math.min(this.env.JWT_ACCESS_TTL, 1800);
    const accessToken = await this.jwt.signAsync(
      {
        sub: target.id,
        orgId: target.orgId,
        email: target.email,
        isSystemAdmin: target.isSystemAdmin,
        act: { sub: actor.sub, email: actor.email },
      },
      { secret: this.env.JWT_ACCESS_SECRET, expiresIn: ttl },
    );
    await this.audit.record({
      orgId: actor.orgId,
      actorUserId: actor.sub,
      action: 'user.impersonate',
      targetType: 'User',
      targetId: target.id,
      metadata: { targetEmail: target.email },
    });
    return { accessToken, expiresIn: ttl, tokenType: 'Bearer', user: this.publicUser(target) };
  }

  /**
   * Step-up authentication (C4): re-verify a fresh TOTP code and mint a
   * short-lived elevated token (`acr: 'step-up'`) for sensitive operations.
   */
  async stepUp(user: AuthUser, totp: string) {
    const method = await prisma.twoFactorMethod.findFirst({
      where: { userId: user.sub, type: 'TOTP', confirmed: true },
    });
    if (!method) throw new BadRequestException('No confirmed TOTP method enrolled');
    const result = await verifyOtp({ secret: method.secret, token: totp });
    if (!result.valid) throw new UnauthorizedException('Invalid two-factor code');
    const ttl = Math.min(this.env.JWT_ACCESS_TTL, 300);
    const accessToken = await this.jwt.signAsync(
      { sub: user.sub, orgId: user.orgId, email: user.email, isSystemAdmin: user.isSystemAdmin, acr: 'step-up' },
      { secret: this.env.JWT_ACCESS_SECRET, expiresIn: ttl },
    );
    return { accessToken, expiresIn: ttl, tokenType: 'Bearer', acr: 'step-up' };
  }

  /**
   * Mint an access/refresh pair. On a fresh login `family` is omitted and a new
   * rotation family is created; on refresh the caller passes the existing family
   * so the chain stays linked and replay detection can burn it as a unit.
   */
  private async issueTokens(
    user: { id: string; orgId: string; email: string; isSystemAdmin: boolean },
    family?: string,
  ) {
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
    // A unique jti guarantees every refresh token is a distinct JWT. Without it
    // the payload is just { sub } + second-granularity iat/exp, so two tokens
    // minted for the same user within the same second are byte-identical → same
    // tokenHash → a unique-constraint 500 on create (hit by multi-tab sessions
    // and concurrent 401→refresh retries).
    const refreshToken = await this.jwt.signAsync(
      { sub: user.id, jti: randomToken(16) },
      { secret: this.env.JWT_REFRESH_SECRET, expiresIn: this.env.JWT_REFRESH_TTL },
    );
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        family: family ?? randomToken(8),
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
    avatarUrl?: string | null;
    locale?: string;
  }) {
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      orgId: user.orgId,
      isSystemAdmin: user.isSystemAdmin,
      avatarUrl: user.avatarUrl ?? null,
      locale: user.locale ?? 'en',
    };
  }
}
