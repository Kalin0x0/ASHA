import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    sessionStaging: { findMany: vi.fn(), updateMany: vi.fn() },
    session: { findMany: vi.fn(), count: vi.fn() },
  },
}));

vi.mock('@asha/db', () => ({ prisma: prismaMock }));

import { StagingReconcilerService } from './staging-reconciler.service';

const RULE = {
  id: 'rule1',
  orgId: 'org1',
  workspaceId: 'ws1',
  zoneId: 'zone1',
  desiredSessions: 2,
  enabled: true,
};

/** Minimal pool-session row as the reconciler selects it. */
const pool = (id: string, status = 'RUNNING', createdAt = new Date('2026-01-01')) => ({
  id,
  orgId: 'org1',
  zoneId: 'zone1',
  containerId: null,
  kasmId: `k-${id}`,
  agentId: null,
  status,
  createdAt,
});

describe('StagingReconcilerService', () => {
  let svc: StagingReconcilerService;
  let sessions: { createStaged: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    sessions = {
      createStaged: vi.fn().mockResolvedValue({ ok: true, sessionId: 'new' }),
      destroy: vi.fn().mockResolvedValue(true),
    };
    svc = new StagingReconcilerService(sessions as never);

    prismaMock.sessionStaging.findMany.mockResolvedValue([RULE]);
    prismaMock.sessionStaging.updateMany.mockResolvedValue({ count: 1 });
    // Default: nothing staged anywhere (orphans, ERROR rows, pool all empty).
    prismaMock.session.findMany.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('provisions the deficit up to the per-tick cap', async () => {
    const res = await svc.reconcile();
    expect(res.created).toBe(2); // desired 2, pool 0, cap 2
    expect(sessions.createStaged).toHaveBeenCalledTimes(2);
    expect(sessions.createStaged).toHaveBeenCalledWith(RULE);
    // Healthy run clears lastError.
    expect(prismaMock.sessionStaging.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ lastError: null }) }),
    );
  });

  it('caps a large deficit at MAX_NEW_PER_TICK', async () => {
    prismaMock.sessionStaging.findMany.mockResolvedValue([{ ...RULE, desiredSessions: 10 }]);
    const res = await svc.reconcile();
    expect(res.created).toBe(2);
  });

  it('does nothing when the pool is exactly at target', async () => {
    prismaMock.session.findMany
      .mockResolvedValueOnce([]) // orphans
      .mockResolvedValueOnce([]) // ERROR rows
      .mockResolvedValueOnce([pool('a'), pool('b')]); // pool at target
    const res = await svc.reconcile();
    expect(res).toEqual({ created: 0, retired: 0 });
    expect(sessions.createStaged).not.toHaveBeenCalled();
    expect(sessions.destroy).not.toHaveBeenCalled();
  });

  it('retires the surplus, not-yet-ready sessions first, then newest ready', async () => {
    prismaMock.sessionStaging.findMany.mockResolvedValue([{ ...RULE, desiredSessions: 1 }]);
    prismaMock.session.findMany
      .mockResolvedValueOnce([]) // orphans
      .mockResolvedValueOnce([]) // ERROR rows
      .mockResolvedValueOnce([
        pool('ready-old', 'RUNNING', new Date('2026-01-01')),
        pool('ready-new', 'RUNNING', new Date('2026-01-03')),
        pool('warming', 'PROVISIONING', new Date('2026-01-02')),
      ]);
    const res = await svc.reconcile();
    expect(res.retired).toBe(2);
    const retiredIds = sessions.destroy.mock.calls.map((c) => c[0].id);
    // The provisioning one goes first, then the newest ready one; the
    // longest-warm session survives.
    expect(retiredIds).toEqual(['warming', 'ready-new']);
    expect(sessions.destroy).toHaveBeenCalledWith(expect.anything(), 'staging_surplus', undefined, { onlyIfUnclaimed: true });
  });

  it('treats a disabled rule as target 0 and drains its pool', async () => {
    prismaMock.sessionStaging.findMany.mockResolvedValue([{ ...RULE, enabled: false }]);
    prismaMock.session.findMany
      .mockResolvedValueOnce([]) // orphans
      .mockResolvedValueOnce([]) // ERROR rows
      .mockResolvedValueOnce([pool('a')]);
    const res = await svc.reconcile();
    expect(res.retired).toBe(1);
    expect(sessions.createStaged).not.toHaveBeenCalled();
  });

  it('retires orphans whose rule was deleted — including ERROR leftovers', async () => {
    prismaMock.sessionStaging.findMany.mockResolvedValue([]);
    prismaMock.session.findMany.mockResolvedValueOnce([pool('orphan1'), pool('orphan2', 'ERROR')]);
    const res = await svc.reconcile();
    expect(res.retired).toBe(2);
    expect(sessions.destroy).toHaveBeenCalledWith(expect.anything(), 'staging_orphaned', undefined, { onlyIfUnclaimed: true });
  });

  it('cleans up ERROR rows of a live rule, records lastError and backs off (no churn loop)', async () => {
    vi.useFakeTimers();
    prismaMock.session.findMany
      .mockResolvedValueOnce([]) // orphans
      .mockResolvedValueOnce([pool('failed', 'ERROR')]); // ERROR rows for rule1
    const res = await svc.reconcile();
    expect(res.retired).toBe(1);
    expect(sessions.destroy).toHaveBeenCalledWith(expect.anything(), 'staging_failed', undefined, { onlyIfUnclaimed: true });
    // Async launch failures (agent never delivered) must surface on the rule…
    expect(prismaMock.sessionStaging.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lastError: expect.stringContaining('launch timeout') }),
      }),
    );
    // …and back the rule off: no immediate re-provision attempt.
    expect(sessions.createStaged).not.toHaveBeenCalled();
    prismaMock.session.findMany.mockResolvedValue([]);
    await svc.reconcile();
    expect(sessions.createStaged).not.toHaveBeenCalled();
  });

  it('retires with the unclaimed precondition and does not count sessions a claimer won', async () => {
    prismaMock.sessionStaging.findMany.mockResolvedValue([{ ...RULE, desiredSessions: 0 }]);
    prismaMock.session.findMany
      .mockResolvedValueOnce([]) // orphans
      .mockResolvedValueOnce([]) // ERROR rows
      .mockResolvedValueOnce([pool('a'), pool('b')]);
    // 'a' was claimed between selection and destroy → destroy reports false.
    sessions.destroy.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const res = await svc.reconcile();
    expect(sessions.destroy).toHaveBeenCalledWith(expect.anything(), 'staging_surplus', undefined, {
      onlyIfUnclaimed: true,
    });
    expect(res.retired).toBe(1);
  });

  it('skips a tick while the previous one is still running (overlap guard)', async () => {
    let release!: () => void;
    prismaMock.sessionStaging.findMany.mockReturnValue(new Promise((r) => { release = () => r([]); }));
    const first = svc.tick();
    await svc.tick(); // overlaps → must be a no-op
    expect(prismaMock.sessionStaging.findMany).toHaveBeenCalledTimes(1);
    release();
    await first;
  });

  it('writes the failure reason to lastError and backs off the rule', async () => {
    vi.useFakeTimers();
    sessions.createStaged.mockResolvedValue({ ok: false, reason: 'No ONLINE agent available in zone "default"' });

    await svc.reconcile();
    expect(prismaMock.sessionStaging.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lastError: expect.stringContaining('No ONLINE agent') }),
      }),
    );

    // Within the backoff window the rule is skipped entirely.
    sessions.createStaged.mockClear();
    await svc.reconcile();
    expect(sessions.createStaged).not.toHaveBeenCalled();

    // After the backoff lapses it tries again.
    vi.advanceTimersByTime(6 * 60_000);
    await svc.reconcile();
    expect(sessions.createStaged).toHaveBeenCalled();
  });

  it('one broken rule never stalls the others', async () => {
    const rule2 = { ...RULE, id: 'rule2' };
    prismaMock.sessionStaging.findMany.mockResolvedValue([RULE, rule2]);
    // rule1's pool query explodes; rule2 proceeds.
    prismaMock.session.findMany
      .mockResolvedValueOnce([]) // orphans
      .mockRejectedValueOnce(new Error('boom')) // rule1 ERROR-row query
      .mockResolvedValueOnce([]) // rule2 ERROR rows
      .mockResolvedValueOnce([]); // rule2 pool
    const res = await svc.reconcile();
    expect(res.created).toBe(2); // rule2 filled its deficit
    expect(sessions.createStaged).toHaveBeenCalledWith(rule2);
  });

  it('honours the ASHA_STAGING_RECONCILER=false kill-switch', async () => {
    process.env.ASHA_STAGING_RECONCILER = 'false';
    try {
      await svc.tick();
      expect(prismaMock.sessionStaging.findMany).not.toHaveBeenCalled();
    } finally {
      delete process.env.ASHA_STAGING_RECONCILER;
    }
  });
});
