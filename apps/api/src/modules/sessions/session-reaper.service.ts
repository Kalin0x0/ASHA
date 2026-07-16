import { Injectable, Logger, Optional } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { prisma } from '@asha/db';
import { TariffsService } from '../tariffs/tariffs.service';
import { SessionsService } from './sessions.service';

/** Session statuses that are still alive and therefore reapable. */
const ACTIVE_STATUSES = ['REQUESTED', 'SCHEDULED', 'PROVISIONING', 'RUNNING', 'DEGRADED', 'PAUSED'] as const;

/**
 * Statuses the global abandoned-session reaper targets: a container/connection
 * that actually came up (RUNNING/DEGRADED) but whose viewer has gone silent.
 * Pre-RUNNING states are handled by the launch-timeout reaper, and PAUSED is
 * left to its own dedicated cap so an intentionally-paused session is not killed.
 */
const ABANDONABLE_STATUSES = ['RUNNING', 'DEGRADED'] as const;

/**
 * Periodically terminates sessions that have outlived their hard duration cap
 * (`expiresAt`) or have gone idle past their workspace's `idleTimeoutMinutes`.
 * Idle is measured from `lastKeepaliveAt` (refreshed by the viewer heartbeat).
 */
@Injectable()
export class SessionReaperService {
  private readonly logger = new Logger(SessionReaperService.name);

  constructor(
    private readonly sessions: SessionsService,
    // Optional so unit tests can construct the reaper without tariffs; when
    // present, active sessions are metered against their holder's budget.
    @Optional() private readonly tariffs?: TariffsService,
  ) {}

  /**
   * Meter active sessions against their holders' tariff budgets, reset any
   * budgets whose period rolled over, and terminate sessions whose holder just
   * ran out of time (reason `quota_exhausted`). No-op when tariffs are unset.
   */
  @Interval('tariff-meter', 60_000)
  async meterTariffs(): Promise<number> {
    if (!this.tariffs) return 0;
    await this.tariffs.resetExpiredPeriods();
    const exhaustedIds = await this.tariffs.meterAndCollectExhausted();
    if (exhaustedIds.length === 0) return 0;
    const due = await prisma.session.findMany({
      where: { id: { in: exhaustedIds } },
      select: { id: true, orgId: true, zoneId: true, containerId: true, kasmId: true, agentId: true },
    });
    for (const s of due) await this.sessions.destroy(s, 'quota_exhausted');
    this.logger.log(`Reaped ${due.length} session(s) over their tariff budget`);
    return due.length;
  }

  /**
   * Tear down expired 10-minute demo accounts: destroy their live sessions, drop
   * the demo tariff assignment, then delete the user (cascading its rows). The
   * DemoGrant is intentionally left behind so the e-mail/device stays one-shot.
   */
  @Interval('demo-reaper', 60_000)
  async reapDemoUsers(): Promise<number> {
    const expired = await prisma.user.findMany({
      where: { status: 'DEMO', demoExpiresAt: { not: null, lte: new Date() } },
      select: { id: true, orgId: true },
    });
    if (expired.length === 0) return 0;

    for (const u of expired) {
      const live = await prisma.session.findMany({
        where: { userId: u.id, status: { in: [...ACTIVE_STATUSES] } },
        select: { id: true, orgId: true, zoneId: true, containerId: true, kasmId: true, agentId: true },
      });
      for (const s of live) await this.sessions.destroy(s, 'demo_expired');
      await prisma.tariffAssignment.deleteMany({ where: { orgId: u.orgId, subjectType: 'USER', subjectId: u.id } });
      await prisma.user.delete({ where: { id: u.id } });
    }
    this.logger.log(`Pruned ${expired.length} expired demo account(s)`);
    return expired.length;
  }

  /**
   * Enforce sellable, time-limited licenses: deactivate accounts whose
   * `deactivatesAt` has passed. Unlike demo accounts these are KEPT (not deleted)
   * so an admin can renew them — we kill live sessions, revoke refresh tokens,
   * and flip status → DISABLED (which the login gate already rejects). Login also
   * checks this just-in-time, so this reaper is the backstop for already-signed-in
   * users and the ≤60 s window between expiry and the next tick.
   */
  @Interval('license-reaper', 60_000)
  async reapExpiredLicenses(): Promise<number> {
    const now = new Date();
    const expired = await prisma.user.findMany({
      // System admins are exempt from license expiry — licenses are for customer
      // accounts, and auto-disabling the last admin would lock everyone out.
      where: { status: 'ACTIVE', isSystemAdmin: false, deactivatesAt: { not: null, lte: now } },
      select: { id: true },
    });
    if (expired.length === 0) return 0;

    for (const u of expired) {
      const live = await prisma.session.findMany({
        where: { userId: u.id, status: { in: [...ACTIVE_STATUSES] } },
        select: { id: true, orgId: true, zoneId: true, containerId: true, kasmId: true, agentId: true },
      });
      for (const s of live) await this.sessions.destroy(s, 'license_expired');
      // Revoke live refresh tokens so an open tab can't silently refresh past expiry.
      await prisma.refreshToken.updateMany({
        where: { userId: u.id, revokedAt: null },
        data: { revokedAt: now },
      });
      // Revoke the user's API keys too — ApiKeyGuard honours revokedAt, and
      // without this an expired customer keeps full Developer-API access (the
      // guard never re-checks the owning account's status).
      await prisma.apiKey.updateMany({
        where: { userId: u.id, revokedAt: null },
        data: { revokedAt: now },
      });
      await prisma.user.update({ where: { id: u.id }, data: { status: 'DISABLED' } });
    }
    this.logger.log(`Deactivated ${expired.length} expired user license(s)`);
    return expired.length;
  }

  /**
   * Sessions left in TERMINATING longer than this are force-finalized to
   * DESTROYED. Covers the case where an agent received the destroy event but
   * died (or lost connectivity) before it could stop the container and ack —
   * without this, such sessions linger in TERMINATING forever.
   */
  private static readonly TERMINATING_GRACE_MS = 2 * 60_000;

  @Interval('session-reaper', 60_000)
  async reap(): Promise<number> {
    const expired = await this.reapExpired();
    const idle = await this.reapIdle();
    const stuck = await this.reapStuckTerminating();
    const total = expired + idle + stuck;
    if (total > 0) {
      this.logger.log(`Reaped ${expired} expired, ${idle} idle and ${stuck} stuck-terminating session(s)`);
    }
    return total;
  }

  /**
   * Fail launches that never reached RUNNING within the launch timeout
   * (`ASHA_LAUNCH_TIMEOUT_SECONDS`, default 300s). Without this a session with
   * no available agent — or whose agent never reports back (slow image pull /
   * weak connection) — would sit in REQUESTED/SCHEDULED/PROVISIONING forever and
   * the viewer would spin indefinitely. Runs more often than the hourly caps.
   */
  @Interval('session-launch-reaper', 30_000)
  async reapStuckLaunches(): Promise<number> {
    const secs = Number(process.env.ASHA_LAUNCH_TIMEOUT_SECONDS ?? 300);
    if (!Number.isFinite(secs) || secs <= 0) return 0;
    const cutoff = new Date(Date.now() - secs * 1000);
    const stuck = await prisma.session.findMany({
      where: {
        status: { in: ['REQUESTED', 'SCHEDULED', 'PROVISIONING'] },
        createdAt: { lt: cutoff },
      },
      select: { id: true, orgId: true, zoneId: true, containerId: true },
    });
    for (const s of stuck) {
      await this.sessions.failStuckLaunch(s, 'launch_timeout');
    }
    if (stuck.length > 0) {
      this.logger.warn(`Failed ${stuck.length} launch(es) stuck past ${secs}s`);
    }
    return stuck.length;
  }

  /**
   * Force-finalize sessions wedged in TERMINATING past the grace period. The
   * normal path waits for the agent's DESTROYED ack; this is the backstop for
   * when that ack never comes (agent crash / network partition).
   */
  private async reapStuckTerminating(): Promise<number> {
    const cutoff = new Date(Date.now() - SessionReaperService.TERMINATING_GRACE_MS);
    const stuck = await prisma.session.findMany({
      where: { status: 'TERMINATING', updatedAt: { lt: cutoff } },
      select: { id: true, kasmId: true, agentId: true },
    });
    for (const s of stuck) {
      await this.sessions.finalizeDestroyed(s);
    }
    return stuck.length;
  }

  /**
   * Safety-net idle reaper: terminate ANY session that came up but whose viewer
   * has gone silent (no `lastKeepaliveAt` refresh) for longer than a global
   * ceiling (`ASHA_SESSION_MAX_IDLE_MINUTES`, default 120; <= 0 disables).
   *
   * The per-workspace `reapIdle` only covers workspaces that set
   * `idleTimeoutMinutes`; server-backed (RDP/VNC/SSH) sessions and workspaces
   * with no idle timeout would otherwise live forever. Abandoned sessions pile
   * up until the org's licensed concurrent-session cap is hit — at which point
   * NO new session (container OR server) can launch, which presents to the user
   * as "the container won't start". The viewer refreshes lastKeepaliveAt
   * continuously, so a gap this large means the session is genuinely abandoned.
   * destroy() also dispatches the agent destroy, reclaiming the container and
   * (via the heartbeat's authoritative recount) the scheduling slot.
   */
  @Interval('session-abandoned-reaper', 60_000)
  async reapAbandoned(): Promise<number> {
    const max = Number(process.env.ASHA_SESSION_MAX_IDLE_MINUTES ?? 120);
    if (!Number.isFinite(max) || max <= 0) return 0;
    const cutoff = new Date(Date.now() - max * 60_000);
    const due = await prisma.session.findMany({
      where: {
        status: { in: [...ABANDONABLE_STATUSES] },
        lastKeepaliveAt: { lt: cutoff },
        // Unclaimed staged pool sessions have no viewer to keepalive them BY
        // DESIGN — their lifecycle belongs to the staging reconciler alone.
        userId: { not: null },
      },
      select: { id: true, orgId: true, zoneId: true, containerId: true },
    });
    for (const s of due) {
      await this.sessions.destroy(s, 'idle_timeout');
    }
    if (due.length > 0) {
      this.logger.warn(`Reaped ${due.length} abandoned session(s) idle past ${max}m (no keepalive)`);
    }
    return due.length;
  }

  /**
   * Mark agents OFFLINE once their heartbeat goes stale
   * (`ASHA_AGENT_OFFLINE_SECONDS`, default 90s). Agents heartbeat every few
   * seconds, so a gap this large means the process is gone (stopped container,
   * dead host). Without this, agents that never sent a clean shutdown linger as
   * ONLINE — misleading the dashboard's "online" count and the agent fleet view.
   * A still-live agent is never caught (its heartbeat keeps it well under the
   * cutoff), and a transiently-flipped agent self-heals: the next heartbeat sets
   * it back ONLINE. The scheduler already ignores stale-heartbeat agents, so this
   * keeps `status` honest rather than affecting placement.
   */
  @Interval('agent-liveness-reaper', 30_000)
  async reapStaleAgents(): Promise<number> {
    const secs = Number(process.env.ASHA_AGENT_OFFLINE_SECONDS ?? 90);
    if (!Number.isFinite(secs) || secs <= 0) return 0;
    const cutoff = new Date(Date.now() - secs * 1000);
    const res = await prisma.agent.updateMany({
      where: { status: 'ONLINE', lastHeartbeatAt: { lt: cutoff } },
      data: { status: 'OFFLINE' },
    });
    if (res.count > 0) {
      this.logger.warn(`Marked ${res.count} stale agent(s) OFFLINE (no heartbeat in ${secs}s)`);
    }
    return res.count;
  }

  /**
   * Deregister agent records that have been OFFLINE far longer than any
   * plausible restart (`ASHA_AGENT_PRUNE_DAYS`, default 7; <= 0 disables).
   *
   * Every agent-container restart enrolls a FRESH registration (a new row); the
   * previous one is flipped OFFLINE by reapStaleAgents but never removed, so
   * dead "phantom" rows pile up in the fleet view / "online X/Y" count over time
   * (one per reboot, redeploy or crash). This prunes the long-dead ones. The
   * Session→Agent FK is `onDelete: SetNull`, so removing an agent only clears
   * the (historical) agentId on its already-terminated sessions — nothing live
   * is affected, and ONLINE/DRAINING agents are never touched.
   */
  @Interval('agent-prune-reaper', 3_600_000)
  async pruneDeadAgents(): Promise<number> {
    const days = Number(process.env.ASHA_AGENT_PRUNE_DAYS ?? 7);
    if (!Number.isFinite(days) || days <= 0) return 0;
    const cutoff = new Date(Date.now() - days * 86_400_000);
    const res = await prisma.agent.deleteMany({
      where: {
        status: 'OFFLINE',
        OR: [{ lastHeartbeatAt: { lt: cutoff } }, { lastHeartbeatAt: null, createdAt: { lt: cutoff } }],
      },
    });
    if (res.count > 0) {
      this.logger.warn(`Pruned ${res.count} dead agent registration(s) (OFFLINE since > ${days}d)`);
    }
    return res.count;
  }

  /**
   * Terminate sessions that have been PAUSED longer than the configured cap
   * (`ASHA_MAX_PAUSED_MINUTES`). A paused container retains disk + RAM state
   * but still holds host resources, so deployments can bound how long that
   * persists. Disabled (no reaping) when the env var is unset or <= 0.
   * Time-since-paused is read from `updatedAt`, which is stamped when the
   * session transitions to PAUSED.
   */
  @Interval('session-paused-reaper', 60_000)
  async reapPaused(): Promise<number> {
    const max = Number(process.env.ASHA_MAX_PAUSED_MINUTES);
    if (!Number.isFinite(max) || max <= 0) return 0;
    const cutoff = new Date(Date.now() - max * 60_000);
    const due = await prisma.session.findMany({
      // pausedAt (set on PAUSE, cleared on RESUME) — NOT updatedAt, which
      // background stats writes churn every few seconds.
      where: { status: 'PAUSED', pausedAt: { not: null, lt: cutoff } },
      select: { id: true, orgId: true, zoneId: true, containerId: true, kasmId: true, agentId: true },
    });
    for (const s of due) {
      await this.sessions.destroy(s, 'paused_timeout');
    }
    if (due.length > 0) {
      this.logger.log(`Reaped ${due.length} session(s) paused beyond ${max}m`);
    }
    return due.length;
  }

  /** Terminate sessions whose hard lifetime cap has passed. */
  private async reapExpired(): Promise<number> {
    const due = await prisma.session.findMany({
      where: { status: { in: [...ACTIVE_STATUSES] }, expiresAt: { not: null, lte: new Date() } },
      select: { id: true, orgId: true, zoneId: true, containerId: true, kasmId: true, agentId: true },
    });
    for (const s of due) {
      await this.sessions.destroy(s, 'expired');
    }
    return due.length;
  }

  /**
   * Terminate sessions that have been idle longer than their workspace allows.
   * Done per-workspace so each workspace's own timeout applies; a missing or
   * zero timeout means "never idle-reap".
   */
  private async reapIdle(): Promise<number> {
    const workspaces = await prisma.workspace.findMany({
      where: { idleTimeoutMinutes: { not: null, gt: 0 } },
      select: { id: true, idleTimeoutMinutes: true },
    });
    let count = 0;
    for (const ws of workspaces) {
      const cutoff = new Date(Date.now() - (ws.idleTimeoutMinutes as number) * 60_000);
      const idle = await prisma.session.findMany({
        where: {
          workspaceId: ws.id,
          status: { in: [...ACTIVE_STATUSES] },
          lastKeepaliveAt: { lt: cutoff },
          // Unclaimed staged pool sessions are idle by definition — the staging
          // reconciler owns their lifecycle, not the per-workspace idle policy.
          userId: { not: null },
        },
        select: { id: true, orgId: true, zoneId: true, containerId: true, kasmId: true, agentId: true },
      });
      for (const s of idle) {
        await this.sessions.destroy(s, 'idle_timeout');
        count++;
      }
    }
    return count;
  }
}
