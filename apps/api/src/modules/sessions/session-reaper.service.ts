import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { prisma } from '@asha/db';
import { SessionsService } from './sessions.service';

/** Session statuses that are still alive and therefore reapable. */
const ACTIVE_STATUSES = ['REQUESTED', 'SCHEDULED', 'PROVISIONING', 'RUNNING', 'DEGRADED', 'PAUSED'] as const;

/**
 * Periodically terminates sessions that have outlived their hard duration cap
 * (`expiresAt`) or have gone idle past their workspace's `idleTimeoutMinutes`.
 * Idle is measured from `lastKeepaliveAt` (refreshed by the viewer heartbeat).
 */
@Injectable()
export class SessionReaperService {
  private readonly logger = new Logger(SessionReaperService.name);

  constructor(private readonly sessions: SessionsService) {}

  @Interval('session-reaper', 60_000)
  async reap() {
    const expired = await this.reapExpired();
    const idle = await this.reapIdle();
    if (expired + idle > 0) {
      this.logger.log(`Reaped ${expired} expired and ${idle} idle session(s)`);
    }
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
      select: { id: true, orgId: true, zoneId: true, containerId: true },
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
      select: { id: true, orgId: true, zoneId: true, containerId: true },
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
        },
        select: { id: true, orgId: true, zoneId: true, containerId: true },
      });
      for (const s of idle) {
        await this.sessions.destroy(s, 'idle_timeout');
        count++;
      }
    }
    return count;
  }
}
