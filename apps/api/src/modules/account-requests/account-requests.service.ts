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

/**
 * Ceiling on unreviewed requests. Past this the public endpoint quietly stops
 * recording new ones, so an anonymous caller cannot grow the table (or bury a
 * real request under noise) while an operator is away.
 */
const MAX_PENDING = Number(process.env.ASHA_MAX_PENDING_ACCOUNT_REQUESTS) || 500;

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

  /**
   * The org an unauthenticated visitor lands in. There is no host→org mapping in
   * this product, so the public endpoints resolve the oldest org, exactly as the
   * instant-demo flow does. `assertPublicOrg` keeps the admin toggle honest
   * about that instead of letting a second org silently write a dead setting.
   */
  private publicOrg() {
    return prisma.org.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true } });
  }

  /** Public: may visitors request an account on this deployment? */
  async getConfig(): Promise<{ enabled: boolean }> {
    const org = await this.publicOrg();
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

  /**
   * Public sign-up has exactly one landing org (see `publicOrg`). An admin of a
   * different org toggling it would write a setting nothing ever reads, and see
   * a switch that silently does nothing — so say so instead.
   */
  private async assertPublicOrg(user: AuthUser) {
    const org = await this.publicOrg();
    if (!org) throw new ServiceUnavailableException('Account requests are not available');
    if (org.id !== user.orgId) {
      throw new ForbiddenException(
        'Public sign-up is served by the primary organisation and can only be configured there.',
      );
    }
  }

  /** Admin: read the toggle. Reports the effective public state, not a local one. */
  async getSettings(user: AuthUser): Promise<{ enabled: boolean; configurable: boolean }> {
    const org = await this.publicOrg();
    const configurable = !!org && org.id === user.orgId;
    return { enabled: configurable ? await this.isEnabled(user.orgId) : false, configurable };
  }

  /** Admin: open or close public sign-up for this deployment. */
  async setSettings(user: AuthUser, enabled: boolean): Promise<{ enabled: boolean }> {
    await this.assertPublicOrg(user);
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
   * Accept a visitor's request.
   *
   * Always answers `{ status: 'PENDING' }` once the feature is open — the same
   * response whether the address is new, already has an account, or already has
   * a request. Distinguishable answers would turn this into a user-enumeration
   * oracle for anyone walking a corporate address list, which is also the
   * targeting step for seeding a request under someone else's name. The real
   * outcome is recorded as a security event for the operator instead.
   */
  async submit(input: SubmitRequestInput): Promise<{ status: 'PENDING' }> {
    const org = await this.publicOrg();
    if (!org) throw new ServiceUnavailableException('Account requests are not available');
    const orgId = org.id;
    if (!(await this.isEnabled(orgId))) throw new ForbiddenException('Account requests are disabled');

    const email = input.email.trim().toLowerCase();
    const username = (input.username?.trim() || email.split('@')[0] || 'user').toLowerCase();
    const displayName = input.displayName?.trim() || null;
    const reason = input.reason?.trim() || null;
    const ACCEPTED = { status: 'PENDING' } as const;

    const noop = async (why: string) => {
      await this.security.emit({
        action: 'auth.account_request_ignored',
        severity: 'warn',
        orgId,
        ip: input.ip,
        userAgent: input.userAgent,
        metadata: { email, reason: why },
      });
      return ACCEPTED;
    };

    // An address that already has an account must not be shadowed by a request.
    const existingUser = await prisma.user.findFirst({ where: { orgId, email }, select: { id: true } });
    if (existingUser) return noop('existing_account');

    const prior = await prisma.accountRequest.findUnique({
      where: { orgId_email: { orgId, email } },
      select: { id: true, status: true },
    });

    // Already queued — nothing to do, and re-hashing would hand an attacker a
    // free bcrypt on every replay.
    if (prior?.status === 'PENDING') return noop('already_pending');
    // Approved once already; if the account was since deleted an admin should
    // decide again deliberately rather than have it silently re-open.
    if (prior?.status === 'APPROVED') return noop('already_approved');

    // Cap the queue so an anonymous caller cannot grow the table without bound.
    if (!prior) {
      const queued = await prisma.accountRequest.count({ where: { orgId, status: 'PENDING' } });
      if (queued >= MAX_PENDING) return noop('queue_full');
    }

    // Hash last: bcrypt costs hundreds of ms of CPU on a single Node thread, so
    // every cheap rejection above must happen first — otherwise a replay flood
    // becomes CPU exhaustion that starves ordinary sign-ins.
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
      // Claim the row FIRST, conditional on it still being PENDING. The status
      // transition is the lock: without it two admins hitting Approve and Reject
      // at the same moment both pass the earlier read, and the queue ends up
      // showing REJECTED while a working account quietly exists.
      const claimed = await tx.accountRequest.updateMany({
        where: { id: req.id, orgId: user.orgId, status: 'PENDING' },
        data: {
          status: 'APPROVED',
          reviewedById: user.sub,
          reviewedAt: new Date(),
          reviewNote: input.note?.trim() || null,
        },
      });
      if (claimed.count !== 1) throw new ConflictException('This request has already been reviewed');

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
      // Link the account back to the request now that it has an id.
      await tx.accountRequest.update({ where: { id: req.id }, data: { createdUserId: newUser.id } });
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
    // Conditional on still-PENDING, so a reject racing an approve loses cleanly
    // instead of marking an already-created account's request as refused.
    const claimed = await prisma.accountRequest.updateMany({
      where: { id: req.id, orgId: user.orgId, status: 'PENDING' },
      data: {
        status: 'REJECTED',
        reviewedById: user.sub,
        reviewedAt: new Date(),
        reviewNote: note?.trim() || null,
        // Don't keep a usable credential for an account that was refused.
        passwordHash: '',
      },
    });
    if (claimed.count !== 1) throw new ConflictException('This request has already been reviewed');
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
      // Also check e-mails: login resolves `OR: [{ email }, { username }]`, so a
      // username equal to someone else's address would make that person's login
      // ambiguous — and could lock them out of their own account.
      const taken = await prisma.user.findFirst({
        where: { orgId, OR: [{ username: candidate }, { email: candidate }] },
        select: { id: true },
      });
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
