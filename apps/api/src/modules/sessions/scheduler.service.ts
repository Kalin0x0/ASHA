import { Injectable } from '@nestjs/common';
import { prisma } from '@chista/db';

const HEARTBEAT_STALE_MS = 30_000;

@Injectable()
export class SchedulerService {
  /**
   * Greedy single-zone scheduler: pick the least-loaded ONLINE agent in the zone
   * with a fresh heartbeat and spare capacity. Pluggable for load/AD autoscale later.
   */
  async pickAgent(zoneId: string) {
    const freshAfter = new Date(Date.now() - HEARTBEAT_STALE_MS);
    const agents = await prisma.agent.findMany({
      where: { zoneId, status: 'ONLINE', lastHeartbeatAt: { gte: freshAfter } },
    });
    const withCapacity = agents.filter((a) => a.maxSessions === 0 || a.currentSessions < a.maxSessions);
    if (withCapacity.length === 0) return null;
    return withCapacity.sort((a, b) => a.loadPercent - b.loadPercent)[0];
  }
}
