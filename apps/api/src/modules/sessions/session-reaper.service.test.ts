import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    session: { findMany: vi.fn() },
    workspace: { findMany: vi.fn() },
  },
}));

vi.mock('@chista/db', () => ({ prisma: prismaMock }));

import { SessionReaperService } from './session-reaper.service';

describe('SessionReaperService', () => {
  let svc: SessionReaperService;
  let sessions: { destroy: ReturnType<typeof vi.fn>; failStuckLaunch: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    sessions = {
      destroy: vi.fn().mockResolvedValue(undefined),
      failStuckLaunch: vi.fn().mockResolvedValue(undefined),
    };
    svc = new SessionReaperService(sessions as never);
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
    expect(prismaMock.session.findMany).toHaveBeenLastCalledWith(
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

  it('reaps PAUSED sessions older than CHISTA_MAX_PAUSED_MINUTES', async () => {
    process.env.CHISTA_MAX_PAUSED_MINUTES = '60';
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
    delete process.env.CHISTA_MAX_PAUSED_MINUTES;
  });

  it('skips paused reaping when CHISTA_MAX_PAUSED_MINUTES is unset', async () => {
    delete process.env.CHISTA_MAX_PAUSED_MINUTES;

    const n = await svc.reapPaused();

    expect(n).toBe(0);
    expect(prismaMock.session.findMany).not.toHaveBeenCalled();
  });

  it('fails launches stuck in a pre-RUNNING state past the launch timeout', async () => {
    process.env.CHISTA_LAUNCH_TIMEOUT_SECONDS = '300';
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
    delete process.env.CHISTA_LAUNCH_TIMEOUT_SECONDS;
  });

  it('skips stuck-launch reaping when the timeout is disabled (<= 0)', async () => {
    process.env.CHISTA_LAUNCH_TIMEOUT_SECONDS = '0';
    const n = await svc.reapStuckLaunches();
    expect(n).toBe(0);
    expect(prismaMock.session.findMany).not.toHaveBeenCalled();
    delete process.env.CHISTA_LAUNCH_TIMEOUT_SECONDS;
  });
});
