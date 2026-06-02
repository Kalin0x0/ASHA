import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { prisma } from '@chista/db';
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
