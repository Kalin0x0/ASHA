import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { hashPassword, verifyPassword } from '@asha/crypto';
import { prisma } from '@asha/db';
import { AuditService } from '../../common/audit.service';
import type { AuthUser } from '../../common/decorators';
import { SecurityEventService } from '../../common/security-event.service';

/** Columns safe to return for the caller's own profile — never secrets. */
const SELF_SELECT = {
  id: true,
  email: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  status: true,
  isSystemAdmin: true,
  locale: true,
  federatedFrom: true,
  lastLoginAt: true,
  createdAt: true,
} as const;

export interface UpdateAccountInput {
  displayName?: string | null;
  locale?: string;
  avatarUrl?: string | null;
  email?: string;
}

/**
 * Self-service profile: a signed-in user manages their own account (display
 * name, locale, avatar, e-mail, password, 2FA state). Every route operates on
 * `user.sub` — there is no id parameter, so a user can only ever touch their own
 * record. Security-sensitive changes (password, e-mail) also emit a SIEM event.
 */
@Injectable()
export class AccountService {
  constructor(
    private readonly audit: AuditService,
    private readonly security: SecurityEventService,
  ) {}

  /** The caller's full self-profile, plus derived flags the UI needs. */
  async getProfile(user: AuthUser) {
    const row = await prisma.user.findUnique({
      where: { id: user.sub },
      select: { ...SELF_SELECT, credentials: { where: { kind: 'PASSWORD' }, select: { id: true } }, twoFactorMethods: { where: { confirmed: true }, select: { id: true } }, groups: { select: { group: { select: { name: true } } } } },
    });
    if (!row) throw new NotFoundException('User not found');
    const { credentials, twoFactorMethods, groups, federatedFrom, ...rest } = row;
    return {
      ...rest,
      // Local (password) account ⇒ may change e-mail/password. Federated (SSO)
      // accounts are owned by the IdP, so those are read-only here.
      isLocalAccount: federatedFrom == null,
      hasPassword: credentials.length > 0,
      twoFactorEnabled: twoFactorMethods.length > 0,
      groups: groups.map((g) => g.group.name),
    };
  }

  async updateProfile(user: AuthUser, dto: UpdateAccountInput) {
    const target = await prisma.user.findUnique({ where: { id: user.sub } });
    if (!target) throw new NotFoundException('User not found');

    const data: Record<string, unknown> = {};
    if (dto.displayName !== undefined) data.displayName = dto.displayName?.trim() || null;
    if (dto.locale !== undefined) data.locale = dto.locale;
    if (dto.avatarUrl !== undefined) data.avatarUrl = normalizeAvatar(dto.avatarUrl);

    let emailChanged = false;
    if (dto.email !== undefined) {
      if (target.federatedFrom != null) {
        throw new ForbiddenException('Your e-mail is managed by your identity provider and cannot be changed here.');
      }
      const email = dto.email.trim().toLowerCase();
      if (email !== target.email) {
        const clash = await prisma.user.findFirst({ where: { orgId: user.orgId, email, id: { not: user.sub } } });
        if (clash) throw new ConflictException('That e-mail is already in use.');
        data.email = email;
        emailChanged = true;
      }
    }

    const updated = await prisma.user.update({ where: { id: user.sub }, data, select: SELF_SELECT });

    if (emailChanged) {
      await this.security.emit({
        action: 'account.email_changed',
        severity: 'warn',
        orgId: user.orgId,
        actorUserId: user.sub,
        metadata: { from: target.email, to: data.email },
      });
    } else {
      await this.audit.record({ orgId: user.orgId, actorUserId: user.sub, action: 'account.update', targetType: 'User', targetId: user.sub });
    }
    return updated;
  }

  async changePassword(user: AuthUser, dto: { currentPassword?: string; newPassword: string }) {
    if (dto.newPassword.length < 8) throw new BadRequestException('New password must be at least 8 characters.');
    const cred = await prisma.userCredential.findFirst({ where: { userId: user.sub, kind: 'PASSWORD' } });

    // If a password already exists, the current one must be proven. Accounts
    // without one (SSO-provisioned) may set an initial password.
    if (cred) {
      if (!dto.currentPassword || !(await verifyPassword(dto.currentPassword, cred.secret))) {
        throw new UnauthorizedException('Your current password is incorrect.');
      }
    }

    const secret = await hashPassword(dto.newPassword);
    if (cred) await prisma.userCredential.update({ where: { id: cred.id }, data: { secret } });
    else await prisma.userCredential.create({ data: { userId: user.sub, kind: 'PASSWORD', secret } });

    await this.security.emit({
      action: 'account.password_changed',
      severity: 'warn',
      orgId: user.orgId,
      actorUserId: user.sub,
      metadata: { initial: !cred },
    });
    return { ok: true };
  }
}

/**
 * Accept an inline data-URL image (the client resizes to a small square) or an
 * http(s) URL; empty clears the avatar. Guards against oversized payloads and
 * non-image/junk schemes so avatarUrl stays render-safe under the CSP
 * (`img-src 'self' data:`).
 */
function normalizeAvatar(value: string | null): string | null {
  const v = (value ?? '').trim();
  if (!v) return null;
  if (v.startsWith('data:image/')) {
    if (v.length > 1_500_000) throw new BadRequestException('Image is too large — please choose a smaller photo.');
    return v;
  }
  if (/^https?:\/\//i.test(v)) return v;
  throw new BadRequestException('Avatar must be an uploaded image or an http(s) URL.');
}
