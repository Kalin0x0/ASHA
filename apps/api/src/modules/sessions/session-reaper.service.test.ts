import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    session: { findMany: vi.fn() },
    workspace: { findMany: vi.fn() },
    agent: { deleteMany: vi.fn() },
  },
}));

vi.mock('@asha/db', () => ({ prisma: prismaMock }));

import { SessionReaperService } from './session-reaper.service';

describe('SessionReaperService', () => {
  let svc: SessionReaperService;
  let sessions: { destroy: ReturnType<typeof vi.fn>; failStuckLaunch: ReturnType<typeof vi.fn>; finalizeDestroyed: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    sessions = {
      destroy: vi.fn().mockResolvedValue(undefined),
      failStuckLaunch: vi.fn().mockResolvedValue(undefined),
      finalizeDestroyed: vi.fn().mockResolvedValue(undefined),
    };
    svc = new SessionReaperService(sessions as never);
    // Default empty result so the stuck-TERMINATING sweep (the last findMany in
    // reap()) is a no-op unless a test sets it explicitly.
    prismaMock.session.findMany.mockResolvedValue([]);
  });

  it('terminates expired sessions with reason "expired"', async () => {
    prismaMock.session.findMany.mockResolvedValueOnce([
      { id: 's1', orgId: 'o1', zoneId: 'z1', containerId: 'c1' },
      { id: 's2', orgId: 'o1', zoneId: 'z1', containerId: null },
    ]);
    prismaMock.workspace.findMany.mockResolvedValue([]); // no idle timeouts

    await svc.reap();

    expect(sessions.destroy).toHaveBeenCalledTimes(2);
    expect(sessions.destroy).toHaveBeenCalledWith(expect.objectContaining({ id: 's1' }), 'expired');
    expect(sessions.destroy).toHaveBeenCalledWith(expect.objectContaining({ id: 's2' }), 'expired');
  });

  it('only queries active sessions that are actually past expiry', async () => {
    prismaMock.session.findMany.mockResolvedValueOnce([]);
    prismaMock.workspace.findMany.mockResolvedValue([]);

    await svc.reap();

    expect(prismaMock.session.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: expect.arrayContaining(['RUNNING', 'PAUSED']) },
          expiresAt: { not: null, lte: expect.any(Date) },
        }),
      }),
    );
  });

  it('terminates idle sessions per-workspace using its idleTimeoutMinutes', async () => {
    prismaMock.session.findMany
      .mockResolvedValueOnce([]) // no expired
      .mockResolvedValueOnce([{ id: 'idle1', orgId: 'o1', zoneId: 'z1', containerId: 'c9' }]); // idle in ws1
    prismaMock.workspace.findMany.mockResolvedValue([{ id: 'ws1', idleTimeoutMinutes: 15 }]);

    await svc.reap();

    expect(sessions.destroy).toHaveBeenCalledWith(expect.objectContaining({ id: 'idle1' }), 'idle_timeout');
    // idle query is scoped to the workspace with a cutoff derived from its timeout
    // (not necessarily the last findMany — the stuck-TERMINATING sweep runs after).
    expect(prismaMock.session.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: 'ws1',
          lastKeepaliveAt: { lt: expect.any(Date) },
        }),
      }),
    );
  });

  it('does nothing when no sessions are due', async () => {
    prismaMock.session.findMany.mockResolvedValue([]);
    prismaMock.workspace.findMany.mockResolvedValue([{ id: 'ws1', idleTimeoutMinutes: 30 }]);

    await svc.reap();

    expect(sessions.destroy).not.toHaveBeenCalled();
  });

  it('force-finalizes sessions stuck in TERMINATING past the grace period', async () => {
    prismaMock.session.findMany
      .mockResolvedValueOnce([]) // no expired
      .mockResolvedValueOnce([{ id: 'stuck1', kasmId: 'k1', agentId: 'a1' }]); // stuck terminating
    prismaMock.workspace.findMany.mockResolvedValue([]); // no idle timeouts

    await svc.reap();

    expect(sessions.finalizeDestroyed).toHaveBeenCalledWith(expect.objectContaining({ id: 'stuck1' }));
    // The sweep targets TERMINATING rows older than the grace cutoff.
    expect(prismaMock.session.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'TERMINATING', updatedAt: { lt: expect.any(Date) } }),
      }),
    );
  });

  it('reaps PAUSED sessions older than ASHA_MAX_PAUSED_MINUTES', async () => {
    process.env.ASHA_MAX_PAUSED_MINUTES = '60';
    prismaMock.session.findMany.mockResolvedValueOnce([
      { id: 'p1', orgId: 'o1', zoneId: 'z1', containerId: 'c1' },
    ]);

    const n = await svc.reapPaused();

    expect(n).toBe(1);
    expect(sessions.destroy).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }), 'paused_timeout');
    expect(prismaMock.session.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'PAUSED', pausedAt: { not: null, lt: expect.any(Date) } }),
      }),
    );
    delete process.env.ASHA_MAX_PAUSED_MINUTES;
  });

  it('skips paused reaping when ASHA_MAX_PAUSED_MINUTES is unset', async () => {
    delete process.env.ASHA_MAX_PAUSED_MINUTES;

    const n = await svc.reapPaused();

    expect(n).toBe(0);
    expect(prismaMock.session.findMany).not.toHaveBeenCalled();
  });

  it('fails launches stuck in a pre-RUNNING state past the launch timeout', async () => {
    process.env.ASHA_LAUNCH_TIMEOUT_SECONDS = '300';
    prismaMock.session.findMany.mockResolvedValueOnce([
      { id: 'stuck1', orgId: 'o1', zoneId: 'z1', containerId: null },
      { id: 'stuck2', orgId: 'o1', zoneId: 'z1', containerId: 'c2' },
    ]);

    const n = await svc.reapStuckLaunches();

    expect(n).toBe(2);
    expect(sessions.failStuckLaunch).toHaveBeenCalledWith(expect.objectContaining({ id: 'stuck1' }), 'launch_timeout');
    expect(sessions.failStuckLaunch).toHaveBeenCalledWith(expect.objectContaining({ id: 'stuck2' }), 'launch_timeout');
    expect(prismaMock.session.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ['REQUESTED', 'SCHEDULED', 'PROVISIONING'] },
          createdAt: { lt: expect.any(Date) },
        }),
      }),
    );
    delete process.env.ASHA_LAUNCH_TIMEOUT_SECONDS;
  });

  it('skips stuck-launch reaping when the timeout is disabled (<= 0)', async () => {
    process.env.ASHA_LAUNCH_TIMEOUT_SECONDS = '0';
    const n = await svc.reapStuckLaunches();
    expect(n).toBe(0);
    expect(prismaMock.session.findMany).not.toHaveBeenCalled();
    delete process.env.ASHA_LAUNCH_TIMEOUT_SECONDS;
  });

  it('reaps RUNNING/DEGRADED sessions abandoned past ASHA_SESSION_MAX_IDLE_MINUTES (default 120)', async () => {
    delete process.env.ASHA_SESSION_MAX_IDLE_MINUTES; // exercise the default
    prismaMock.session.findMany.mockResolvedValueOnce([
      { id: 'ab1', orgId: 'o1', zoneId: 'z1', containerId: 'c1' },
      { id: 'ab2', orgId: 'o1', zoneId: 'z1', containerId: null }, // e.g. a server/RDP session
    ]);

    const n = await svc.reapAbandoned();

    expect(n).toBe(2);
    expect(sessions.destroy).toHaveBeenCalledWith(expect.objectContaining({ id: 'ab1' }), 'idle_timeout');
    expect(sessions.destroy).toHaveBeenCalledWith(expect.objectContaining({ id: 'ab2' }), 'idle_timeout');
    // Targets only came-up-but-silent sessions; never PAUSED or pre-RUNNING.
    expect(prismaMock.session.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ['RUNNING', 'DEGRADED'] },
          lastKeepaliveAt: { lt: expect.any(Date) },
        }),
      }),
    );
  });

  it('skips abandoned reaping when ASHA_SESSION_MAX_IDLE_MINUTES <= 0', async () => {
    process.env.ASHA_SESSION_MAX_IDLE_MINUTES = '0';
    const n = await svc.reapAbandoned();
    expect(n).toBe(0);
    expect(prismaMock.session.findMany).not.toHaveBeenCalled();
    delete process.env.ASHA_SESSION_MAX_IDLE_MINUTES;
  });

  it('prunes OFFLINE agent registrations stale past ASHA_AGENT_PRUNE_DAYS (default 7)', async () => {
    delete process.env.ASHA_AGENT_PRUNE_DAYS; // exercise the default
    prismaMock.agent.deleteMany.mockResolvedValueOnce({ count: 12 });

    const n = await svc.pruneDeadAgents();

    expect(n).toBe(12);
    // Only OFFLINE rows, by stale heartbeat (or never-heartbeated + old) — never ONLINE/DRAINING.
    expect(prismaMock.agent.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'OFFLINE',
          OR: [
            { lastHeartbeatAt: { lt: expect.any(Date) } },
            { lastHeartbeatAt: null, createdAt: { lt: expect.any(Date) } },
          ],
        }),
      }),
    );
  });

  it('skips agent pruning when ASHA_AGENT_PRUNE_DAYS <= 0', async () => {
    process.env.ASHA_AGENT_PRUNE_DAYS = '0';
    const n = await svc.pruneDeadAgents();
    expect(n).toBe(0);
    expect(prismaMock.agent.deleteMany).not.toHaveBeenCalled();
    delete process.env.ASHA_AGENT_PRUNE_DAYS;
  });
});
