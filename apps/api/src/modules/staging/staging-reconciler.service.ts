import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { prisma } from '@asha/db';
import { SessionsService } from '../sessions/sessions.service';

/**
 * The engine behind SessionStaging: reconciles the actual pool of pre-warmed
 * sessions toward each rule's `desiredSessions` (the CRUD in StagingService is
 * just configuration — without this loop nothing is ever pre-warmed).
 *
 * Every 30s, per rule:
 *  - deficit  → provision unclaimed sessions via SessionsService.createStaged
 *               (capped per tick; failures back off and are surfaced on the
 *               rule's lastError so a stuck pool is never silent)
 *  - surplus  → retire unclaimed sessions (rule scaled down or disabled)
 *  - leftovers→ retire ERROR'd staged rows (e.g. launch-timeout) and orphans
 *               whose rule was deleted
 *
 * Claimed sessions (userId set) are invisible to all of this — once claimed, a
 * session belongs to its user and only the ordinary lifecycle applies.
 *
 * Disable with ASHA_STAGING_RECONCILER=false (rules themselves are the opt-in,
 * so the loop defaults ON — unlike the autoscale runner, whose configs can
 * pre-exist without intent).
 */

/** Unclaimed pool states that count toward a rule's fill level. */
const POOL_ACTIVE = ['REQUESTED', 'SCHEDULED', 'PROVISIONING', 'RUNNING', 'DEGRADED'] as const;
/** Retirement preference: not-yet-ready first, then unhealthy, then ready. */
const RETIRE_RANK: Record<string, number> = {
  REQUESTED: 0,
  SCHEDULED: 1,
  PROVISIONING: 2,
  DEGRADED: 3,
  RUNNING: 4,
};
/** New provisions per rule per tick — fills fast (30s ticks) without letting one rule monopolise agent capacity. */
const MAX_NEW_PER_TICK = 2;
/** After a failed provision, leave the rule alone for this long. */
const FAILURE_BACKOFF_MS = 5 * 60_000;

type RetireRow = {
  id: string;
  orgId: string;
  zoneId: string | null;
  containerId: string | null;
  kasmId: string;
  agentId: string | null;
  status: string;
  createdAt: Date;
};

type PoolRow = RetireRow & { agent: { status: string } | null };

const RETIRE_SELECT = {
  id: true,
  orgId: true,
  zoneId: true,
  containerId: true,
  kasmId: true,
  agentId: true,
  status: true,
  createdAt: true,
} as const;

const POOL_SELECT = { ...RETIRE_SELECT, agent: { select: { status: true } } } as const;

/** A RUNNING/DEGRADED pool session is only real capacity if its agent is live. */
function agentLive(s: PoolRow): boolean {
  if (s.status !== 'RUNNING' && s.status !== 'DEGRADED') return true; // still provisioning — leave to the launch reaper
  return s.agent?.status === 'ONLINE';
}

@Injectable()
export class StagingReconcilerService {
  private readonly logger = new Logger('staging-reconciler');
  /** ruleId → earliest next provision attempt (in-memory; a restart just retries). */
  private readonly backoffUntil = new Map<string, number>();
  /** Overlap guard: a slow tick (many rules × provision round-trips) must not
   *  interleave with the next one — two ticks both seeing the same deficit
   *  would over-provision past desiredSessions. */
  private running = false;

  constructor(private readonly sessions: SessionsService) {}

  @Interval('staging-reconciler', 30_000)
  async tick(): Promise<void> {
    if (process.env.ASHA_STAGING_RECONCILER === 'false') return;
    if (this.running) return;
    this.running = true;
    try {
      await this.reconcile();
    } catch (e) {
      this.logger.warn(`tick failed: ${(e as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  /** The verifiable core — drive directly in tests. */
  async reconcile(): Promise<{ created: number; retired: number }> {
    let created = 0;
    let retired = 0;
    const rules = await prisma.sessionStaging.findMany({
      include: { workspace: { select: { enabled: true } } },
    });

    // Orphans first: unclaimed pool sessions (incl. ERROR'd ones) whose rule no
    // longer exists. With zero rules, every staged leftover is an orphan.
    const orphans = await prisma.session.findMany({
      where: {
        userId: null,
        stagingId: { not: null, notIn: rules.map((r) => r.id) },
        status: { in: [...POOL_ACTIVE, 'ERROR'] },
      },
      select: RETIRE_SELECT,
    });
    retired += await this.retire(orphans, 'staging_orphaned');

    for (const rule of rules) {
      try {
        // ERROR'd staged rows (launch-timeout etc.) are dead weight — retire
        // them so they neither count as fill nor clutter the sessions list.
        // These failures happen ASYNCHRONOUSLY (createStaged succeeded, the
        // agent never delivered), so they must ALSO back the rule off and land
        // on lastError — otherwise a broken zone/image churns a fresh corpse
        // every launch-timeout window without the admin ever seeing why.
        const failedRows = await prisma.session.findMany({
          where: { stagingId: rule.id, userId: null, status: 'ERROR' },
          select: RETIRE_SELECT,
        });
        if (failedRows.length > 0) {
          retired += await this.retire(failedRows, 'staging_failed');
          this.backoffUntil.set(rule.id, Date.now() + FAILURE_BACKOFF_MS);
          await prisma.sessionStaging.updateMany({
            where: { id: rule.id },
            data: {
              lastError: `${failedRows.length} staged launch(es) failed to come up (launch timeout) — check the zone's agent and image`,
              lastReconciledAt: new Date(),
            },
          });
          continue; // resume filling after the backoff, not this tick
        }

        // A disabled OR deleted workspace means the pool can't serve anyone —
        // drain it to zero (its containers would otherwise sit un-claimable and
        // un-reaped, since the reapers now exempt userId null).
        const desired = rule.enabled && rule.workspace?.enabled ? rule.desiredSessions : 0;

        const rawPool = await prisma.session.findMany({
          where: { stagingId: rule.id, userId: null, status: { in: [...POOL_ACTIVE] } },
          select: POOL_SELECT,
        });
        // Sessions whose agent went dark are unreachable ghosts — retire them
        // and don't count them as fill, so the reconciler replaces them.
        const dead = rawPool.filter((s) => !agentLive(s));
        if (dead.length > 0) retired += await this.retire(dead, 'staging_agent_offline');
        const pool = rawPool.filter(agentLive);

        if (pool.length > desired) {
          const surplus = [...pool]
            .sort(
              (a, b) =>
                (RETIRE_RANK[a.status] ?? 9) - (RETIRE_RANK[b.status] ?? 9) ||
                b.createdAt.getTime() - a.createdAt.getTime(),
            )
            .slice(0, pool.length - desired);
          retired += await this.retire(surplus, 'staging_surplus');
        } else if (pool.length < desired) {
          if ((this.backoffUntil.get(rule.id) ?? 0) > Date.now()) continue;
          let failed: string | null = null;
          for (let i = 0; i < Math.min(desired - pool.length, MAX_NEW_PER_TICK); i += 1) {
            const res = await this.sessions.createStaged(rule);
            if (!res.ok) {
              failed = res.reason;
              break;
            }
            created += 1;
          }
          if (failed) {
            this.backoffUntil.set(rule.id, Date.now() + FAILURE_BACKOFF_MS);
            this.logger.warn(`rule ${rule.id}: ${failed}`);
          } else {
            this.backoffUntil.delete(rule.id);
          }
          await prisma.sessionStaging.updateMany({
            where: { id: rule.id },
            data: { lastError: failed, lastReconciledAt: new Date() },
          });
          continue;
        }

        // At target — record the healthy state.
        await prisma.sessionStaging.updateMany({
          where: { id: rule.id },
          data: { lastError: null, lastReconciledAt: new Date() },
        });
      } catch (e) {
        // One broken rule must never stall the others.
        this.logger.warn(`rule ${rule.id} failed: ${(e as Error).message}`);
      }
    }

    if (created > 0 || retired > 0) {
      this.logger.log(`Staged ${created} session(s), retired ${retired}`);
    }
    return { created, retired };
  }

  private async retire(sessions: RetireRow[], reason: string): Promise<number> {
    let n = 0;
    for (const s of sessions) {
      // onlyIfUnclaimed folds "is it still ours?" into the same atomic update a
      // claim races against: a user who claimed this session between our
      // selection and now keeps it, and the retire is a clean no-op.
      const destroyed = await this.sessions.destroy(s, reason, undefined, { onlyIfUnclaimed: true });
      if (destroyed) n += 1;
    }
    return n;
  }
}
