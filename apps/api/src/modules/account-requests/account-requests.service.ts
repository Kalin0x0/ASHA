import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { hashPassword } from '@asha/crypto';
import { prisma } from '@asha/db';
import type { AuthUser } from '../../common/decorators';
import { SecurityEventService } from '../../common/security-event.service';

/** Columns safe to hand to an admin client — never the password hash. */
const SAFE_SELECT = {
  id: true,
  email: true,
  username: true,
  displayName: true,
  reason: true,
  status: true,
  ip: true,
  userAgent: true,
  reviewedById: true,
  reviewedAt: true,
  reviewNote: true,
  createdUserId: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** Group a newly approved account joins when the admin doesn't pick one. */
const DEMO_GROUP_NAME = 'Demo Users';

/** ORG-scoped Setting key gating the public endpoint. Absent ⇒ closed. */
const SETTING_KEY = 'accountRequests.enabled';

export interface SubmitRequestInput {
  email: string;
  username?: string;
  displayName?: string;
  reason?: string;
  password: string;
  ip?: string;
  userAgent?: string;
}

export interface ApproveInput {
  /** ISO date when the approved account auto-deactivates. Null/omitted = perpetual. */
  deactivatesAt?: string | null;
  /** Group to place the new user in. Defaults to "Demo Users", else the org default. */
  groupId?: string;
  /** Override the requested username (e.g. when the derived one is taken). */
  username?: string;
  /** Optional note kept on the request for the audit trail. */
  note?: string;
}

/**
 * Self-service account requests, gated on admin approval.
 *
 * Distinct from the instant 10-minute demo (`DemoModule`): nothing is provisioned
 * until a human approves, so this is the safe way to expose a public sign-up on
 * an internet-facing deployment. A request is not an account — it lives in its
 * own table and can never be logged into, counted or listed as a user until an
 * admin approves it, at which point a real `User` is minted from it.
 *
 * The public endpoint is deliberately narrow: it is throttled at the controller,
 * defaults to OFF (an admin must switch it on), refuses addresses that already
 * have an account, and logs every rejection as a security event.
 */
@Injectable()
export class AccountRequestsService {
  constructor(private readonly security: SecurityEventService) {}

  // ── Public surface ─────────────────────────────────────────────────────────

  /** Public: may visitors request an account on this deployment? */
  async getConfig(): Promise<{ enabled: boolean }> {
    const org = await prisma.org.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!org) return { enabled: false };
    return { enabled: await this.isEnabled(org.id) };
  }

  /**
   * Default OFF — unlike the demo toggle. A public sign-up form that appears
   * without the operator opting in would be a surprise on an exposed instance.
   */
  private async isEnabled(orgId: string): Promise<boolean> {
    const row = await prisma.setting.findUnique({
      where: { scope_orgId_zoneId_key: { scope: 'ORG', orgId, zoneId: '', key: SETTING_KEY } },
    });
    return row?.valueJson === true;
  }

  /** Admin: read the toggle for this org. */
  async getSettings(user: AuthUser): Promise<{ enabled: boolean }> {
    return { enabled: await this.isEnabled(user.orgId) };
  }

  /** Admin: open or close public sign-up for this org. */
  async setSettings(user: AuthUser, enabled: boolean): Promise<{ enabled: boolean }> {
    await prisma.setting.upsert({
      where: { scope_orgId_zoneId_key: { scope: 'ORG', orgId: user.orgId, zoneId: '', key: SETTING_KEY } },
      create: { scope: 'ORG', orgId: user.orgId, zoneId: '', key: SETTING_KEY, valueJson: enabled, type: 'boolean' },
      update: { valueJson: enabled },
    });
    await this.security.emit({
      action: enabled ? 'auth.account_requests_opened' : 'auth.account_requests_closed',
      severity: 'warn',
      orgId: user.orgId,
      actorUserId: user.sub,
      metadata: { enabled },
    });
    return { enabled };
  }

  /**
   * Accept a visitor's request. Returns only a status — never a token, never the
   * created row — so the endpoint leaks nothing about the deployment's users.
   */
  async submit(input: SubmitRequestInput): Promise<{ status: 'PENDING' }> {
    const org = await prisma.org.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!org) throw new ServiceUnavailableException('Account requests are not available');
    const orgId = org.id;
    if (!(await this.isEnabled(orgId))) throw new ForbiddenException('Account requests are disabled');

    const email = input.email.trim().toLowerCase();
    const username = (input.username?.trim() || email.split('@')[0] || 'user').toLowerCase();
    const displayName = input.displayName?.trim() || null;
    const reason = input.reason?.trim() || null;

    // An address that already has an account must not be shadowed by a request.
    const existingUser = await prisma.user.findFirst({ where: { orgId, email }, select: { id: true } });
    if (existingUser) {
      await this.security.emit({
        action: 'auth.account_request_rejected',
        severity: 'warn',
        orgId,
        ip: input.ip,
        userAgent: input.userAgent,
        metadata: { email, reason: 'existing_account' },
      });
      throw new ConflictException('This e-mail already has an account. Please sign in instead.');
    }

    const prior = await prisma.accountRequest.findUnique({
      where: { orgId_email: { orgId, email } },
      select: { id: true, status: true },
    });

    if (prior?.status === 'PENDING') {
      throw new ConflictException('A request for this e-mail is already awaiting review.');
    }
    if (prior?.status === 'APPROVED') {
      // Approved but the account is gone (admin deleted it) — don't silently
      // re-open; an admin should decide again via a fresh conversation.
      throw new ConflictException('This e-mail has already been approved. Please contact your administrator.');
    }

    // Hash last: bcrypt costs ~250ms of CPU, so every cheap rejection above must
    // happen before it or a repeat-submit flood turns into a CPU exhaustion.
    const passwordHash = await hashPassword(input.password);

    if (prior) {
      // Revive a previously rejected request in place, keeping the table bounded.
      await prisma.accountRequest.update({
        where: { id: prior.id },
        data: {
          username,
          displayName,
          reason,
          passwordHash,
          status: 'PENDING',
          ip: input.ip ?? null,
          userAgent: input.userAgent ?? null,
          reviewedById: null,
          reviewedAt: null,
          reviewNote: null,
        },
      });
    } else {
      await prisma.accountRequest.create({
        data: {
          orgId,
          email,
          username,
          displayName,
          reason,
          passwordHash,
          ip: input.ip ?? null,
          userAgent: input.userAgent ?? null,
        },
      });
    }

    await this.security.emit({
      action: 'auth.account_requested',
      severity: 'info',
      orgId,
      ip: input.ip,
      userAgent: input.userAgent,
      metadata: { email, renewed: !!prior },
    });

    return { status: 'PENDING' };
  }

  // ── Admin surface ──────────────────────────────────────────────────────────

  async list(user: AuthUser, status?: string) {
    const known = ['PENDING', 'APPROVED', 'REJECTED'] as const;
    const filter = known.find((s) => s === status?.toUpperCase());
    return prisma.accountRequest.findMany({
      where: { orgId: user.orgId, ...(filter ? { status: filter } : {}) },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      select: SAFE_SELECT,
      take: 500,
    });
  }

  async stats(user: AuthUser) {
    const rows = await prisma.accountRequest.groupBy({
      by: ['status'],
      where: { orgId: user.orgId },
      _count: { _all: true },
    });
    const count = (s: string) => rows.find((r) => r.status === s)?._count._all ?? 0;
    return { pending: count('PENDING'), approved: count('APPROVED'), rejected: count('REJECTED') };
  }

  /**
   * Approve a pending request: mint the real `User`, move the requester's own
   * password hash onto it (so they can sign in immediately without any e-mail),
   * place them in a group and optionally time-box the account.
   */
  async approve(user: AuthUser, id: string, input: ApproveInput = {}) {
    const req = await this.getPending(user, id);

    // Re-check at approval time — the address may have been taken since.
    const emailClash = await prisma.user.findFirst({
      where: { orgId: user.orgId, email: req.email },
      select: { id: true },
    });
    if (emailClash) {
      throw new ConflictException('A user with this e-mail already exists');
    }

    // A username collision must not dead-end the approval: the requester never
    // picked it (it is derived from the e-mail local part), and two people at
    // different domains legitimately collide. Honour an admin override, then
    // fall back to suffixing until it is free.
    const username = await this.freeUsername(user.orgId, input.username?.trim().toLowerCase() || req.username);

    const deactivatesAt = input.deactivatesAt ? new Date(input.deactivatesAt) : null;
    if (deactivatesAt && Number.isNaN(deactivatesAt.getTime())) {
      throw new BadRequestException('Invalid deactivatesAt');
    }

    const group = input.groupId
      ? await prisma.group.findFirst({ where: { id: input.groupId, orgId: user.orgId }, select: { id: true } })
      : ((await prisma.group.findFirst({ where: { orgId: user.orgId, name: DEMO_GROUP_NAME }, select: { id: true } })) ??
        (await prisma.group.findFirst({ where: { orgId: user.orgId, isDefault: true }, select: { id: true } })));
    if (input.groupId && !group) throw new NotFoundException('Group not found');

    // Workspace visibility is deny-by-default, so an account with no grants at
    // all would sign in to an empty catalogue. Grant the demo-flagged workspaces
    // exactly as the instant-demo flow does; an admin can widen this afterwards.
    const demoWorkspaces = await prisma.workspace.findMany({
      where: { orgId: user.orgId, isDemo: true, enabled: true },
      select: { id: true },
    });

    // One transaction: either the account exists and the request is closed, or
    // neither happened. Prevents an approved-but-userless request on failure.
    const created = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          orgId: user.orgId,
          email: req.email,
          username,
          displayName: req.displayName,
          status: 'ACTIVE',
          isSystemAdmin: false,
          locale: 'en',
          ...(deactivatesAt ? { deactivatesAt } : {}),
          // The requester's own password, hashed at submit time.
          credentials: { create: { kind: 'PASSWORD', secret: req.passwordHash } },
        },
        select: { id: true, email: true, username: true, displayName: true, status: true, deactivatesAt: true },
      });
      if (group) {
        await tx.userGroup.create({ data: { orgId: user.orgId, userId: newUser.id, groupId: group.id } });
      }
      for (const ws of demoWorkspaces) {
        await tx.workspaceUser.create({ data: { orgId: user.orgId, workspaceId: ws.id, userId: newUser.id } });
      }
      await tx.accountRequest.update({
        where: { id: req.id },
        data: {
          status: 'APPROVED',
          reviewedById: user.sub,
          reviewedAt: new Date(),
          reviewNote: input.note?.trim() || null,
          createdUserId: newUser.id,
        },
      });
      return newUser;
    });

    await this.security.emit({
      action: 'auth.account_request_approved',
      severity: 'info',
      orgId: user.orgId,
      actorUserId: user.sub,
      targetType: 'User',
      targetId: created.id,
      metadata: { email: req.email, requestId: req.id, deactivatesAt: deactivatesAt?.toISOString() ?? null },
    });

    return { request: await this.getById(user, req.id), user: created };
  }

  /** Turn a request down. The row is kept so the same address can be re-applied. */
  async reject(user: AuthUser, id: string, note?: string) {
    const req = await this.getPending(user, id);
    await prisma.accountRequest.update({
      where: { id: req.id },
      data: {
        status: 'REJECTED',
        reviewedById: user.sub,
        reviewedAt: new Date(),
        reviewNote: note?.trim() || null,
        // Don't keep a usable credential for an account that was refused.
        passwordHash: '',
      },
    });
    await this.security.emit({
      action: 'auth.account_request_rejected',
      severity: 'info',
      orgId: user.orgId,
      actorUserId: user.sub,
      metadata: { email: req.email, requestId: req.id, reason: 'admin_rejected' },
    });
    return this.getById(user, req.id);
  }

  async remove(user: AuthUser, id: string) {
    await this.getById(user, id); // 404s if it isn't ours
    await prisma.accountRequest.delete({ where: { id } });
    return { ok: true as const };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async getById(user: AuthUser, id: string) {
    const row = await prisma.accountRequest.findFirst({
      where: { id, orgId: user.orgId },
      select: SAFE_SELECT,
    });
    if (!row) throw new NotFoundException('Account request not found');
    return row;
  }

  /**
   * Returns `base`, or the first free `base-2`, `base-3`… variant. Usernames are
   * unique per org, and the derived one is only a suggestion, so a collision
   * should never block an approval.
   */
  private async freeUsername(orgId: string, base: string): Promise<string> {
    for (let n = 1; n <= 50; n++) {
      const candidate = n === 1 ? base : `${base}-${n}`;
      const taken = await prisma.user.findFirst({ where: { orgId, username: candidate }, select: { id: true } });
      if (!taken) return candidate;
    }
    throw new ConflictException('Could not derive a free username — set one explicitly');
  }

  /** Loads a request that is still awaiting review, including its password hash. */
  private async getPending(user: AuthUser, id: string) {
    const row = await prisma.accountRequest.findFirst({
      where: { id, orgId: user.orgId },
      select: { id: true, email: true, username: true, displayName: true, passwordHash: true, status: true },
    });
    if (!row) throw new NotFoundException('Account request not found');
    if (row.status !== 'PENDING') throw new ConflictException('This request has already been reviewed');
    return row;
  }
}
