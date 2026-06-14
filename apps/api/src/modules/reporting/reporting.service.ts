import { Injectable } from '@nestjs/common';
import { prisma } from '@chista/db';

/**
 * Reporting: read-only aggregates over sessions, agents, and metric samples.
 * Everything is org-scoped via the tenant extension; date ranges are clamped to
 * sane bounds so a report query can't scan unbounded history.
 */
@Injectable()
export class ReportingService {
  /**
   * FinOps cost report (differentiator) — attributes session runtime cost by
   * user and workspace over a lookback window. Per session-hour cost =
   * allocatedCores·coreHourCost + allocatedGB·gbHourCost. Rates default but are
   * overridable per request; persistent per-org rates are a follow-up (Setting).
   */
  async costs(orgId: string, opts: { days?: number; coreHourCost?: number; gbHourCost?: number } = {}) {
    const to = new Date();
    const days = Math.min(Math.max(opts.days ?? 30, 1), 365);
    const from = new Date(to.getTime() - days * 24 * 3_600_000);
    const coreRate = opts.coreHourCost ?? 0.05;
    const gbRate = opts.gbHourCost ?? 0.01;

    // Sessions whose lifetime overlaps the window (started before `to`, not torn
    // down before `from`). Running sessions accrue cost up to `to` (now).
    const sessions = await prisma.session.findMany({
      where: {
        orgId,
        startedAt: { not: null, lte: to },
        OR: [{ destroyedAt: null }, { destroyedAt: { gte: from } }],
      },
      select: { userId: true, workspaceId: true, workspaceName: true, startedAt: true, destroyedAt: true },
    });

    const wsIds = [...new Set(sessions.map((s) => s.workspaceId).filter(Boolean))] as string[];
    const wss = wsIds.length
      ? await prisma.workspace.findMany({
          where: { id: { in: wsIds } },
          select: { id: true, coresLimit: true, memLimitMb: true, friendlyName: true },
        })
      : [];
    const wsMap = new Map(wss.map((w) => [w.id, w]));

    type Agg = { id: string; name: string; sessions: number; hours: number; cost: number };
    const byUser = new Map<string, Agg>();
    const byWorkspace = new Map<string, Agg>();
    let totalCost = 0;
    let totalHours = 0;
    const fromMs = from.getTime();
    const toMs = to.getTime();

    for (const s of sessions) {
      if (!s.startedAt) continue;
      const a = Math.max(s.startedAt.getTime(), fromMs);
      const b = Math.min((s.destroyedAt ?? to).getTime(), toMs);
      const hours = Math.max(0, (b - a) / 3_600_000);
      if (hours === 0) continue;
      const ws = s.workspaceId ? wsMap.get(s.workspaceId) : undefined;
      const cores = ws?.coresLimit ?? 1;
      const gb = (ws?.memLimitMb ?? 1024) / 1024;
      const cost = hours * (cores * coreRate + gb * gbRate);
      totalCost += cost;
      totalHours += hours;

      const u = byUser.get(s.userId) ?? { id: s.userId, name: s.userId, sessions: 0, hours: 0, cost: 0 };
      u.sessions += 1;
      u.hours += hours;
      u.cost += cost;
      byUser.set(s.userId, u);

      const wkey = s.workspaceId ?? 'unknown';
      const w = byWorkspace.get(wkey) ?? {
        id: wkey,
        name: s.workspaceName ?? ws?.friendlyName ?? 'unknown',
        sessions: 0,
        hours: 0,
        cost: 0,
      };
      w.sessions += 1;
      w.hours += hours;
      w.cost += cost;
      byWorkspace.set(wkey, w);
    }

    const r4 = (n: number) => Math.round(n * 10000) / 10000;
    const shape = (m: Map<string, Agg>) =>
      [...m.values()].map((x) => ({ ...x, hours: r4(x.hours), cost: r4(x.cost) })).sort((p, q) => q.cost - p.cost);

    return {
      window: { from: from.toISOString(), to: to.toISOString(), days },
      rates: { coreHourCost: coreRate, gbHourCost: gbRate, currency: 'USD' },
      totals: { sessions: sessions.length, hours: r4(totalHours), cost: r4(totalCost) },
      byUser: shape(byUser),
      byWorkspace: shape(byWorkspace),
    };
  }

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

    // Server-sessions carry a null workspaceId — exclude them from "top workspaces".
    const ranked = grouped.filter((g): g is typeof g & { workspaceId: string } => g.workspaceId !== null);
    const workspaces = await prisma.workspace.findMany({
      where: { id: { in: ranked.map((g) => g.workspaceId) } },
      select: { id: true, name: true, friendlyName: true },
    });
    const nameById = new Map(workspaces.map((w) => [w.id, w.friendlyName || w.name]));

    return ranked.map((g) => ({
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

  /** Recent audit-log entries (most recent first) with faceted filters. */
  async auditLog(
    orgId: string,
    opts: {
      limit?: number;
      action?: string;
      actorUserId?: string;
      targetType?: string;
      since?: string;
      until?: string;
    } = {},
  ) {
    const take = Math.min(Math.max(opts.limit ?? 100, 1), 500);
    const since = opts.since ? new Date(opts.since) : undefined;
    const until = opts.until ? new Date(opts.until) : undefined;
    const createdAt =
      (since && !Number.isNaN(since.getTime())) || (until && !Number.isNaN(until.getTime()))
        ? {
            ...(since && !Number.isNaN(since.getTime()) ? { gte: since } : {}),
            ...(until && !Number.isNaN(until.getTime()) ? { lte: until } : {}),
          }
        : undefined;
    return prisma.auditLog.findMany({
      where: {
        orgId,
        ...(opts.action ? { action: { contains: opts.action, mode: 'insensitive' } } : {}),
        ...(opts.actorUserId ? { actorUserId: opts.actorUserId } : {}),
        ...(opts.targetType ? { targetType: opts.targetType } : {}),
        ...(createdAt ? { createdAt } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }
}
