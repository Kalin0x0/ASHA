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
import { hashToken, randomToken, verifyPassword, seal, unseal } from '@asha/crypto';
import { prisma } from '@asha/db';
import type { Env } from '@asha/config';
import { generateSecret, generateURI, verify as verifyOtp } from 'otplib';
import qrcode from 'qrcode';
import { AuditService } from '../../common/audit.service';
import type { AuthUser } from '../../common/decorators';
import { ENV } from '../../common/env.module';
import { RbacService } from '../../common/rbac.service';

/** A TOTP code is valid for one 30-second step, and that step is what gets spent. */
const TOTP_PERIOD_MS = 30_000;

/**
 * How long after a rotation a second request may still present the same refresh
 * token and be served rather than treated as theft. Two tabs share one token and
 * both refresh when the access token expires, so a few hundred milliseconds of
 * overlap is ordinary traffic, not an attack. Kept short: past this, a token that
 * turns up again really is one the legitimate client should no longer hold.
 */
const REFRESH_RACE_GRACE_MS = 10_000;

@Injectable()
export class AuthService {
  constructor(
    private readonly jwt: JwtService,
    private readonly rbac: RbacService,
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async login(dto: LoginDto, ip?: string, userAgent?: string) {
    const org = dto.orgSlug ? await prisma.org.findUnique({ where: { slug: dto.orgSlug } }) : null;
    if (dto.orgSlug && (!org || org.status !== 'ACTIVE')) throw new UnauthorizedException('Invalid credentials');
    const candidates = await prisma.user.findMany({
      where: { ...(org ? { orgId: org.id } : {}), OR: [{ email: dto.email }, { username: dto.email }] },
      include: { credentials: true, twoFactorMethods: true },
      take: 2,
    });
    // Emails/usernames are unique per tenant, not globally. Never authenticate
    // whichever row findFirst happens to return when the identity is ambiguous.
    if (candidates.length !== 1) throw new UnauthorizedException('Invalid credentials');
    const user = candidates[0]!;
    // Sellable time-limited accounts: reject an expired license just-in-time
    // (before the ≤60s license-reaper tick) and persist the deactivation +
    // revoke any live refresh tokens. Folded into the same generic rejection as a
    // disabled account so it reveals nothing extra to an unauthenticated caller.
    // System admins are exempt (see license-reaper) so a stray expiry can't lock
    // every admin out.
    const licenseExpired =
      !!user && !user.isSystemAdmin && !!user.deactivatesAt && user.deactivatesAt.getTime() <= Date.now();
    if (!user || user.status !== 'ACTIVE' || licenseExpired) {
      if (user && licenseExpired && user.status === 'ACTIVE') {
        await prisma.user.update({ where: { id: user.id }, data: { status: 'DISABLED' } }).catch(() => undefined);
        await prisma.refreshToken
          .updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } })
          .catch(() => undefined);
      }
      throw new UnauthorizedException('Invalid credentials');
    }

    const cred = user.credentials.find((c) => c.kind === 'PASSWORD');
    if (!cred || !(await verifyPassword(dto.password, cred.secret))) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const confirmedTotp = user.twoFactorMethods.find((m) => m.confirmed && m.type === 'TOTP');
    if (confirmedTotp) {
      if (!dto.totp) throw new UnauthorizedException('Two-factor code required');

      // Cheap rejection of an obvious replay before spending a crypto verify. The
      // binding decision is consumeTotp() below; this read can go stale.
      if (confirmedTotp.lastUsedAt) {
        const windowStart = Math.floor(Date.now() / TOTP_PERIOD_MS) * TOTP_PERIOD_MS;
        if (confirmedTotp.lastUsedAt.getTime() >= windowStart) {
          throw new UnauthorizedException('Two-factor code already used — wait for the next code');
        }
      }

      const result = await verifyOtp({ secret: this.readTotpSecret(confirmedTotp.secret), token: dto.totp });
      if (!result.valid) throw new UnauthorizedException('Invalid two-factor code');
      if (!(await this.consumeTotp(confirmedTotp.id))) {
        throw new UnauthorizedException('Two-factor code already used — wait for the next code');
      }
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
    // Block a refresh once the account's license has expired (JIT, before the
    // reaper), and persist the deactivation so it can't refresh again. Admins exempt.
    const licenseExpired =
      !!user && !user.isSystemAdmin && !!user.deactivatesAt && user.deactivatesAt.getTime() <= Date.now();
    if (!user || user.status !== 'ACTIVE' || licenseExpired) {
      if (user && licenseExpired && user.status === 'ACTIVE') {
        await prisma.user.update({ where: { id: user.id }, data: { status: 'DISABLED' } }).catch(() => undefined);
      }
      throw new UnauthorizedException('User unavailable');
    }

    // Claim the rotation atomically. Reading revokedAt above and writing it here
    // left a gap, and which way it failed depended only on how the interleaving
    // fell: either both callers minted a live successor into one family, or the
    // slower one arrived after the winner's revoke and took the replay branch
    // above — burning the family, signing the user out of every tab, and filing a
    // theft alert that in fact describes ordinary use. The product opens that
    // second tab itself, so this was reachable without an attacker.
    const claimed = await prisma.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    if (claimed.count === 0) {
      // Somebody rotated this exact token between our read and our write. If the
      // family still holds a live token minted moments ago, that was the other tab:
      // a race, not a theft. Mint alongside it and leave the family standing.
      // Every other path here — logout, password change, licence expiry, a real
      // replay — leaves no live member, and the burn is the right answer.
      const successor = await prisma.refreshToken.findFirst({
        where: { family: stored.family, revokedAt: null },
        orderBy: { createdAt: 'desc' },
      });
      const raced =
        !!successor && Date.now() - successor.createdAt.getTime() <= REFRESH_RACE_GRACE_MS;

      if (!raced) {
        await prisma.refreshToken.updateMany({
          where: { family: stored.family, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await this.audit.record({
          orgId: user.orgId,
          actorUserId: stored.userId,
          action: 'auth.refresh_replay_detected',
          metadata: { family: stored.family, concurrent: true },
        });
        throw new UnauthorizedException('Refresh token reuse detected — all sessions revoked');
      }

      // Recorded under its own action so the replay alert keeps meaning something.
      await this.audit.record({
        orgId: user.orgId,
        actorUserId: stored.userId,
        action: 'auth.refresh_race_graced',
        metadata: { family: stored.family },
      });
    }

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
        secret: `sealed:v1:${seal(secret, this.env.SECRET_SEAL_KEY)}`,
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

    const result = await verifyOtp({ secret: this.readTotpSecret(method.secret), token: dto.code });
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
  async disableTotp(userId: string, code: string, orgId?: string) {
    const method = await prisma.twoFactorMethod.findFirst({ where: { userId, type: 'TOTP', confirmed: true } });
    if (!method) throw new BadRequestException('No confirmed TOTP method enrolled');
    const verified = await verifyOtp({ secret: this.readTotpSecret(method.secret), token: code });
    if (!verified.valid) throw new UnauthorizedException('Invalid two-factor code');
    await prisma.twoFactorMethod.deleteMany({ where: { userId, type: 'TOTP' } });
    await this.audit.record({ orgId, actorUserId: userId, action: 'auth.totp_disabled' });
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
    const result = await verifyOtp({ secret: this.readTotpSecret(method.secret), token: totp });
    if (!result.valid) throw new UnauthorizedException('Invalid two-factor code');
    // Step-up spends the code like a login does. Without this, a code seen once —
    // over the operator's shoulder, or in a login this account already completed —
    // stayed good for the rest of its window and could be replayed for an elevated
    // token as often as the attacker liked.
    if (!(await this.consumeTotp(method.id))) {
      throw new UnauthorizedException('Two-factor code already used — wait for the next code');
    }
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

  /**
   * Spend the current TOTP window for one method, atomically. Returns false when
   * somebody else already spent it.
   *
   * A code is only as good as its 30-second step, so the step is the thing that
   * has to be consumed exactly once. Reading lastUsedAt, verifying, then writing
   * it back left a gap wide enough for two requests carrying the same six digits:
   * both read the previous window, both verified, both wrote, and both were let
   * in. Moving the precondition into the WHERE clause makes the database the
   * arbiter — the row only advances into this window for the caller whose
   * condition still holds, and Prisma reports whether that was us.
   *
   * Call this only after verifyOtp has succeeded: claiming the window first would
   * let anyone burn a victim's code with six random digits.
   */
  private async consumeTotp(methodId: string, now: number = Date.now()): Promise<boolean> {
    const windowStart = new Date(Math.floor(now / TOTP_PERIOD_MS) * TOTP_PERIOD_MS);
    const claimed = await prisma.twoFactorMethod.updateMany({
      where: { id: methodId, OR: [{ lastUsedAt: null }, { lastUsedAt: { lt: windowStart } }] },
      data: { lastUsedAt: new Date(now) },
    });
    return claimed.count === 1;
  }

  private readTotpSecret(stored: string): string {
    // Explicit version marker: a corrupted encrypted secret must fail closed.
    // Unmarked legacy base32 secrets remain readable until re-enrollment.
    return stored.startsWith('sealed:v1:')
      ? unseal(stored.slice('sealed:v1:'.length), this.env.SECRET_SEAL_KEY)
      : stored;
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
