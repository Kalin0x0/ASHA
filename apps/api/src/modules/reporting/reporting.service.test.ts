import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    session: { count: vi.fn(), findMany: vi.fn(), groupBy: vi.fn() },
    workspace: { count: vi.fn(), findMany: vi.fn() },
    agent: { count: vi.fn() },
    recording: { count: vi.fn() },
    metricSample: { findMany: vi.fn() },
  },
}));

vi.mock('@asha/db', () => ({ prisma: prismaMock }));

import { ReportingService } from './reporting.service';

describe('ReportingService', () => {
  let svc: ReportingService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new ReportingService();
  });

  it('aggregates a platform summary scoped to the org', async () => {
    prismaMock.session.count.mockResolvedValueOnce(42).mockResolvedValueOnce(7);
    prismaMock.workspace.count.mockResolvedValue(5);
    prismaMock.agent.count.mockResolvedValueOnce(3).mockResolvedValueOnce(4);
    prismaMock.recording.count.mockResolvedValue(12);

    const res = await svc.summary('org1');
    expect(res).toEqual({
      totalSessions: 42,
      activeSessions: 7,
      totalWorkspaces: 5,
      agents: { online: 3, total: 4 },
      recordings: 12,
    });
    expect(prismaMock.session.count).toHaveBeenCalledWith(expect.objectContaining({ where: { orgId: 'org1' } }));
  });

  it('buckets sessions-over-time by day', async () => {
    prismaMock.session.findMany.mockResolvedValue([
      { createdAt: new Date('2026-05-01T10:00:00Z'), workspaceId: 'w1' },
      { createdAt: new Date('2026-05-01T14:00:00Z'), workspaceId: 'w1' },
      { createdAt: new Date('2026-05-02T09:00:00Z'), workspaceId: 'w2' },
    ]);
    const res = await svc.sessionsOverTime('org1', 30);
    expect(res.series).toEqual([
      { date: '2026-05-01', count: 2 },
      { date: '2026-05-02', count: 1 },
    ]);
  });

  it('clamps the day range to <= 365', async () => {
    prismaMock.session.findMany.mockResolvedValue([]);
    await svc.sessionsOverTime('org1', 99999);
    const arg = prismaMock.session.findMany.mock.calls[0][0];
    const since = new Date(arg.where.createdAt.gte).getTime();
    const maxAgoMs = 365 * 24 * 60 * 60 * 1000;
    // since should be no older than ~365 days ago
    expect(Date.now() - since).toBeLessThanOrEqual(maxAgoMs + 60_000);
  });

  it('joins top workspaces with their friendly names', async () => {
    prismaMock.session.groupBy.mockResolvedValue([
      { workspaceId: 'w1', _count: { _all: 9 } },
      { workspaceId: 'w2', _count: { _all: 4 } },
    ]);
    prismaMock.workspace.findMany.mockResolvedValue([
      { id: 'w1', name: 'ubuntu', friendlyName: 'Ubuntu Desktop' },
      { id: 'w2', name: 'chrome', friendlyName: '' },
    ]);
    const res = await svc.topWorkspaces('org1', 30, 10);
    expect(res).toEqual([
      { workspaceId: 'w1', name: 'Ubuntu Desktop', sessions: 9 },
      { workspaceId: 'w2', name: 'chrome', sessions: 4 },
    ]);
  });
});
