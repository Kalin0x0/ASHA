import { Injectable } from '@nestjs/common';
import { prisma } from '@chista/db';

/**
 * Reporting: read-only aggregates over sessions, agents, and metric samples.
 * Everything is org-scoped via the tenant extension; date ranges are clamped to
 * sane bounds so a report query can't scan unbounded history.
 */
@Injectable()
export class ReportingService {
  /** High-level platform summary for the reporting dashboard. */
  async summary(orgId: string) {
    const [
      totalSessions,
      activeSessions,
      totalWorkspaces,
      onlineAgents,
      totalAgents,
      recordings,
    ] = await Promise.all([
      prisma.session.count({ where: { orgId } }),
      prisma.session.count({ where: { orgId, status: { in: ['RUNNING', 'DEGRADED'] } } }),
      prisma.workspace.count({ where: { orgId } }),
      prisma.agent.count({ where: { orgId, status: 'ONLINE' } }),
      prisma.agent.count({ where: { orgId } }),
      prisma.recording.count({ where: { orgId } }),
    ]);

    return {
      totalSessions,
      activeSessions,
      totalWorkspaces,
      agents: { online: onlineAgents, total: totalAgents },
      recordings,
    };
  }

  /** Sessions launched per day over the last `days` (default 30, max 365). */
  async sessionsOverTime(orgId: string, days = 30) {
    const clamped = Math.min(Math.max(days, 1), 365);
    const since = new Date(Date.now() - clamped * 24 * 60 * 60 * 1000);
    const sessions = await prisma.session.findMany({
      where: { orgId, createdAt: { gte: since } },
      select: { createdAt: true, workspaceId: true },
    });

    const byDay = new Map<string, number>();
    for (const s of sessions) {
      const day = s.createdAt.toISOString().slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + 1);
    }
    return {
      since: since.toISOString(),
      series: [...byDay.entries()]
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    };
  }

  /** Top workspaces by session count over the window. */
  async topWorkspaces(orgId: string, days = 30, limit = 10) {
    const clamped = Math.min(Math.max(days, 1), 365);
    const since = new Date(Date.now() - clamped * 24 * 60 * 60 * 1000);
    const grouped = await prisma.session.groupBy({
      by: ['workspaceId'],
      where: { orgId, createdAt: { gte: since } },
      _count: { _all: true },
      orderBy: { _count: { workspaceId: 'desc' } },
      take: Math.min(Math.max(limit, 1), 50),
    });

    const workspaceIds = grouped.map((g) => g.workspaceId);
    const workspaces = await prisma.workspace.findMany({
      where: { id: { in: workspaceIds } },
      select: { id: true, name: true, friendlyName: true },
    });
    const nameById = new Map(workspaces.map((w) => [w.id, w.friendlyName || w.name]));

    return grouped.map((g) => ({
      workspaceId: g.workspaceId,
      name: nameById.get(g.workspaceId) ?? 'Unknown',
      sessions: g._count._all,
    }));
  }

  /** Average of a metric (cpu/mem/sessions/…) bucketed by hour over the window. */
  async metricSeries(orgId: string, metric: string, hours = 24) {
    const clamped = Math.min(Math.max(hours, 1), 720);
    const since = new Date(Date.now() - clamped * 60 * 60 * 1000);
    const samples = await prisma.metricSample.findMany({
      where: { orgId, metric, sampledAt: { gte: since } },
      select: { value: true, sampledAt: true },
      orderBy: { sampledAt: 'asc' },
    });

    const buckets = new Map<string, { sum: number; n: number }>();
    for (const s of samples) {
      const hour = s.sampledAt.toISOString().slice(0, 13); // YYYY-MM-DDTHH
      const b = buckets.get(hour) ?? { sum: 0, n: 0 };
      b.sum += s.value;
      b.n += 1;
      buckets.set(hour, b);
    }
    return {
      metric,
      since: since.toISOString(),
      series: [...buckets.entries()]
        .map(([hour, { sum, n }]) => ({ hour, avg: Math.round((sum / n) * 100) / 100 }))
        .sort((a, b) => a.hour.localeCompare(b.hour)),
    };
  }

  /** Recent audit-log entries (most recent first), optionally filtered by action. */
  async auditLog(orgId: string, limit = 100, action?: string) {
    const take = Math.min(Math.max(limit, 1), 500);
    return prisma.auditLog.findMany({
      where: { orgId, ...(action ? { action: { contains: action, mode: 'insensitive' } } : {}) },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }
}
