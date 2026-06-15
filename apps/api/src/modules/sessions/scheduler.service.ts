import { Injectable } from '@nestjs/common';
import { prisma } from '@chista/db';

const HEARTBEAT_STALE_MS = 30_000;

@Injectable()
export class SchedulerService {
  /**
   * Greedy single-zone scheduler: pick the least-loaded ONLINE agent in the zone
   * with a fresh heartbeat and spare capacity. Pluggable for load/AD autoscale later.
   *
   * Capacity is reserved *atomically*: rather than trusting the (possibly stale)
   * heartbeat count, we issue a conditional `updateMany` that increments
   * `currentSessions` only while capacity still holds at write time. Two
   * concurrent launches therefore cannot both claim the last slot — the loser's
   * conditional update affects 0 rows and we fall through to the next agent.
   * The reservation is released when the session reaches ERROR/DESTROYED.
   */
  async pickAgent(zoneId: string) {
    const primary = await this.pickInZone(zoneId);
    if (primary) return primary;

    // Cross-zone fallback (D7): when the requested zone has no free agent, spill
    // over to the org's other zones (each retaining the atomic capacity reserve).
    const zone = await prisma.deploymentZone.findUnique({ where: { id: zoneId }, select: { orgId: true } });
    if (!zone) return null;
    const others = await prisma.deploymentZone.findMany({
      where: { orgId: zone.orgId, id: { not: zoneId } },
      select: { id: true },
      orderBy: { name: 'asc' },
    });
    for (const z of others) {
      const picked = await this.pickInZone(z.id);
      if (picked) return picked;
    }
    return null;
  }

  /** Least-loaded ONLINE agent in a single zone, with an atomic capacity reserve. */
  private async pickInZone(zoneId: string) {
    const freshAfter = new Date(Date.now() - HEARTBEAT_STALE_MS);
    const agents = await prisma.agent.findMany({
      where: { zoneId, status: 'ONLINE', lastHeartbeatAt: { gte: freshAfter } },
    });
    const candidates = agents
      .filter((a) => a.maxSessions === 0 || a.currentSessions < a.maxSessions)
      .sort((a, b) => a.loadPercent - b.loadPercent);

    for (const agent of candidates) {
      const where =
        agent.maxSessions === 0
          ? { id: agent.id, status: 'ONLINE' as const }
          : { id: agent.id, status: 'ONLINE' as const, currentSessions: { lt: agent.maxSessions } };
      const res = await prisma.agent.updateMany({ where, data: { currentSessions: { increment: 1 } } });
      if (res.count === 1) return { ...agent, currentSessions: agent.currentSessions + 1 };
    }
    return null;
  }
}
