import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from '@asha/db';
import { AuditService } from '../../common/audit.service';
import type { AuthUser } from '../../common/decorators';

/** Session statuses that hold a slot / consume the usage budget. */
const ACTIVE = ['REQUESTED', 'SCHEDULED', 'PROVISIONING', 'RUNNING', 'DEGRADED', 'PAUSED'] as const;
const CONSUMING = ['RUNNING', 'DEGRADED'] as const;

export interface EffectiveTariff {
  tariffId: string;
  name: string;
  period: 'MINUTE' | 'HOUR' | 'MONTH';
  budgetMinutes: number | null;
  maxSessionMinutes: number | null;
  maxConcurrent: number | null;
  assignmentId: string;
  remainingSeconds: number;
}

/**
 * Time-based tariffs: metering & limits (NOT payment processing). A tariff gives
 * a holder a usage budget per period plus hard caps; assignments (org default /
 * group / user) hold the live remaining balance. The service gates launches,
 * caps session duration, meters usage down, and resets budgets each period.
 */
@Injectable()
export class TariffsService {
  constructor(private readonly audit: AuditService) {}

  // ── CRUD ──────────────────────────────────────────────────────────────────

  list(orgId: string) {
    return prisma.tariff.findMany({ where: { orgId }, orderBy: { name: 'asc' } });
  }

  async upsert(
    orgId: string,
    actorUserId: string,
    dto: {
      id?: string;
      name: string;
      period: 'MINUTE' | 'HOUR' | 'MONTH';
      budgetMinutes?: number | null;
      maxSessionMinutes?: number | null;
      maxConcurrent?: number | null;
      isDefault?: boolean;
    },
  ) {
    const data = {
      name: dto.name,
      period: dto.period,
      budgetMinutes: dto.budgetMinutes ?? null,
      maxSessionMinutes: dto.maxSessionMinutes ?? null,
      maxConcurrent: dto.maxConcurrent ?? null,
      isDefault: dto.isDefault ?? false,
    };
    const tariff = dto.id
      ? await this.updateExisting(orgId, dto.id, data)
      : await prisma.tariff.create({ data: { orgId, ...data } });
    // At most one default per org.
    if (data.isDefault) {
      await prisma.tariff.updateMany({ where: { orgId, isDefault: true, id: { not: tariff.id } }, data: { isDefault: false } });
    }
    await this.audit.record({ orgId, actorUserId, action: 'tariff.upsert', targetType: 'Tariff', targetId: tariff.id, metadata: { name: data.name } });
    return tariff;
  }

  private async updateExisting(orgId: string, id: string, data: object) {
    const res = await prisma.tariff.updateMany({ where: { id, orgId }, data });
    if (res.count === 0) throw new NotFoundException('Tariff not found');
    return (await prisma.tariff.findFirst({ where: { id, orgId } }))!;
  }

  async remove(orgId: string, actorUserId: string, id: string) {
    const res = await prisma.tariff.deleteMany({ where: { id, orgId } });
    if (res.count === 0) throw new NotFoundException('Tariff not found');
    await this.audit.record({ orgId, actorUserId, action: 'tariff.delete', targetType: 'Tariff', targetId: id });
    return { ok: true };
  }

  /** Assign a tariff to a subject (org default / group / user), (re)initialising its balance. */
  async assign(
    orgId: string,
    actorUserId: string,
    dto: { tariffId: string; subjectType: 'ORG' | 'GROUP' | 'USER'; subjectId: string },
  ) {
    const tariff = await prisma.tariff.findFirst({ where: { id: dto.tariffId, orgId } });
    if (!tariff) throw new NotFoundException('Tariff not found');
    const remaining = tariff.budgetMinutes != null ? tariff.budgetMinutes * 60 : 0;
    const assignment = await prisma.tariffAssignment.upsert({
      where: { orgId_subjectType_subjectId: { orgId, subjectType: dto.subjectType, subjectId: dto.subjectId } },
      create: { orgId, tariffId: tariff.id, subjectType: dto.subjectType, subjectId: dto.subjectId, remainingSeconds: remaining, periodResetAt: this.nextResetAt(tariff.period) },
      update: { tariffId: tariff.id, remainingSeconds: remaining, periodResetAt: this.nextResetAt(tariff.period) },
    });
    await this.audit.record({ orgId, actorUserId, action: 'tariff.assign', targetType: 'TariffAssignment', targetId: assignment.id, metadata: { subjectType: dto.subjectType, subjectId: dto.subjectId, tariffId: tariff.id } });
    return assignment;
  }

  listAssignments(orgId: string) {
    return prisma.tariffAssignment.findMany({ where: { orgId }, orderBy: { updatedAt: 'desc' } });
  }

  // ── Resolution ──────────────────────────────────────────────────────────────

  /**
   * The effective tariff for a user: an explicit USER assignment wins, else the
   * most-restrictive of the user's GROUP assignments (smallest remaining budget),
   * else the ORG default. Returns null when nothing applies ⇒ unrestricted.
   */
  async resolveForUser(orgId: string, userId: string): Promise<EffectiveTariff | null> {
    const groupIds = (await prisma.userGroup.findMany({ where: { userId }, select: { groupId: true } })).map((g) => g.groupId);
    const assignments = await prisma.tariffAssignment.findMany({
      where: {
        orgId,
        OR: [
          { subjectType: 'USER', subjectId: userId },
          ...(groupIds.length ? [{ subjectType: 'GROUP' as const, subjectId: { in: groupIds } }] : []),
          { subjectType: 'ORG', subjectId: orgId },
        ],
      },
      include: { tariff: true },
    });
    if (assignments.length === 0) return null;

    const byType = (t: string) => assignments.filter((a) => a.subjectType === t);
    const pick =
      byType('USER')[0] ??
      byType('GROUP').sort((a, b) => a.remainingSeconds - b.remainingSeconds)[0] ??
      byType('ORG')[0];
    if (!pick) return null;
    return {
      tariffId: pick.tariff.id,
      name: pick.tariff.name,
      period: pick.tariff.period,
      budgetMinutes: pick.tariff.budgetMinutes,
      maxSessionMinutes: pick.tariff.maxSessionMinutes,
      maxConcurrent: pick.tariff.maxConcurrent,
      assignmentId: pick.id,
      remainingSeconds: pick.remainingSeconds,
    };
  }

  /** Portal view of the caller's own budget (null = unlimited / no tariff). */
  async usageForUser(user: AuthUser): Promise<EffectiveTariff | null> {
    return this.resolveForUser(user.orgId, user.sub);
  }

  // ── Enforcement (called from sessions.service.create) ────────────────────────

  /** Refuse a launch when the tariff budget is exhausted or the concurrency cap is hit. */
  async assertWithinTariff(user: AuthUser): Promise<void> {
    const eff = await this.resolveForUser(user.orgId, user.sub);
    if (!eff) return; // unrestricted
    if (eff.budgetMinutes != null && eff.remainingSeconds <= 0) {
      throw new ForbiddenException(`Your ${eff.name} time budget is used up. It renews next ${eff.period.toLowerCase()}.`);
    }
    if (eff.maxConcurrent != null) {
      const active = await prisma.session.count({ where: { orgId: user.orgId, userId: user.sub, status: { in: ACTIVE as never } } });
      if (active >= eff.maxConcurrent) {
        throw new ForbiddenException(`Your ${eff.name} plan allows ${eff.maxConcurrent} concurrent session(s).`);
      }
    }
  }

  /**
   * Tariff-imposed hard cap (ms from now) for a new session on a workspace with
   * the given cost factor — the min of the per-session cap and the remaining
   * budget converted to wall-clock time. null = no tariff cap.
   */
  async sessionCapMs(user: AuthUser, minuteCostFactor: number): Promise<number | null> {
    const eff = await this.resolveForUser(user.orgId, user.sub);
    if (!eff) return null;
    const caps: number[] = [];
    if (eff.maxSessionMinutes != null) caps.push(eff.maxSessionMinutes * 60_000);
    if (eff.budgetMinutes != null) caps.push((eff.remainingSeconds * 1000) / Math.max(minuteCostFactor, 0.01));
    return caps.length ? Math.max(0, Math.min(...caps)) : null;
  }

  // ── Metering + reset (called from the session reaper) ────────────────────────

  /**
   * Charge elapsed wall-clock (× workspace cost factor) against each active
   * session holder's remaining budget, self-correcting via Session.consumedSeconds.
   * Returns the ids of sessions whose holder just ran out — the reaper destroys
   * them with reason `quota_exhausted`.
   */
  async meterAndCollectExhausted(): Promise<string[]> {
    const now = Date.now();
    const sessions = await prisma.session.findMany({
      where: { status: { in: CONSUMING as never }, startedAt: { not: null } },
      select: { id: true, orgId: true, userId: true, workspaceId: true, startedAt: true, consumedSeconds: true },
    });
    if (sessions.length === 0) return [];

    const factors = new Map<string, number>();
    const workspaceIds = [...new Set(sessions.map((s) => s.workspaceId).filter((id): id is string => Boolean(id)))];
    for (const wid of workspaceIds) {
      const ws = await prisma.workspace.findUnique({ where: { id: wid }, select: { minuteCostFactor: true } });
      factors.set(wid, ws?.minuteCostFactor ?? 1);
    }
    const resolved = new Map<string, EffectiveTariff | null>(); // cache per user
    const exhausted: string[] = [];

    for (const s of sessions) {
      // Server-backed sessions may have no workspace → real-time (factor 1).
      const factor = s.workspaceId ? (factors.get(s.workspaceId) ?? 1) : 1;
      const target = Math.floor(((now - s.startedAt!.getTime()) / 1000) * factor);
      const delta = target - s.consumedSeconds;
      if (delta <= 0) continue;
      await prisma.session.update({ where: { id: s.id }, data: { consumedSeconds: target } });

      const key = `${s.orgId}:${s.userId}`;
      if (!resolved.has(key)) resolved.set(key, await this.resolveForUser(s.orgId, s.userId));
      const eff = resolved.get(key);
      if (!eff || eff.budgetMinutes == null) continue; // unlimited holder

      const res = await prisma.tariffAssignment.updateMany({
        where: { id: eff.assignmentId, remainingSeconds: { gt: 0 } },
        data: { remainingSeconds: { decrement: Math.min(delta, eff.remainingSeconds) } },
      });
      eff.remainingSeconds = Math.max(0, eff.remainingSeconds - delta);
      if (res.count > 0 && eff.remainingSeconds <= 0) exhausted.push(s.id);
    }
    return exhausted;
  }

  /** Refill budgets whose period has rolled over. Returns the number reset. */
  async resetExpiredPeriods(): Promise<number> {
    const due = await prisma.tariffAssignment.findMany({
      where: { periodResetAt: { not: null, lte: new Date() } },
      include: { tariff: true },
    });
    for (const a of due) {
      await prisma.tariffAssignment.update({
        where: { id: a.id },
        data: {
          remainingSeconds: a.tariff.budgetMinutes != null ? a.tariff.budgetMinutes * 60 : 0,
          periodResetAt: this.nextResetAt(a.tariff.period),
        },
      });
    }
    return due.length;
  }

  /** Next period boundary for a tariff period (used to schedule the reset). */
  private nextResetAt(period: 'MINUTE' | 'HOUR' | 'MONTH'): Date {
    const d = new Date();
    if (period === 'MINUTE') return new Date(d.getTime() + 60_000);
    if (period === 'HOUR') return new Date(d.getTime() + 3_600_000);
    // MONTH → first of next month, midnight UTC.
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  }
}
