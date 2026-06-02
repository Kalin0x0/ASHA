import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    agent: { findMany: vi.fn(), updateMany: vi.fn() },
  },
}));

vi.mock('@chista/db', () => ({ prisma: prismaMock }));

import { SchedulerService } from './scheduler.service';

const agent = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'a1',
  zoneId: 'z1',
  status: 'ONLINE',
  loadPercent: 10,
  maxSessions: 5,
  currentSessions: 0,
  ...over,
});

describe('SchedulerService.pickAgent', () => {
  let svc: SchedulerService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new SchedulerService();
  });

  it('returns null when no fresh agent has capacity', async () => {
    prismaMock.agent.findMany.mockResolvedValue([agent({ maxSessions: 2, currentSessions: 2 })]);
    expect(await svc.pickAgent('z1')).toBeNull();
    expect(prismaMock.agent.updateMany).not.toHaveBeenCalled();
  });

  it('atomically reserves a slot on the least-loaded agent', async () => {
    prismaMock.agent.findMany.mockResolvedValue([
      agent({ id: 'busy', loadPercent: 80 }),
      agent({ id: 'idle', loadPercent: 5 }),
    ]);
    prismaMock.agent.updateMany.mockResolvedValue({ count: 1 });

    const picked = await svc.pickAgent('z1');
    expect(picked?.id).toBe('idle');
    expect(picked?.currentSessions).toBe(1); // reflects the optimistic +1
    expect(prismaMock.agent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'idle', currentSessions: { lt: 5 } }),
        data: { currentSessions: { increment: 1 } },
      }),
    );
  });

  it('falls through to the next agent when the conditional reservation loses the race', async () => {
    prismaMock.agent.findMany.mockResolvedValue([
      agent({ id: 'first', loadPercent: 1 }),
      agent({ id: 'second', loadPercent: 2 }),
    ]);
    // First agent's slot was taken by a concurrent launch → 0 rows updated.
    prismaMock.agent.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });

    const picked = await svc.pickAgent('z1');
    expect(picked?.id).toBe('second');
    expect(prismaMock.agent.updateMany).toHaveBeenCalledTimes(2);
  });

  it('reserves on an unlimited agent (maxSessions=0) without an upper-bound guard', async () => {
    prismaMock.agent.findMany.mockResolvedValue([agent({ maxSessions: 0, currentSessions: 99 })]);
    prismaMock.agent.updateMany.mockResolvedValue({ count: 1 });

    const picked = await svc.pickAgent('z1');
    expect(picked?.id).toBe('a1');
    expect(prismaMock.agent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'a1', status: 'ONLINE' }, // no currentSessions bound
        data: { currentSessions: { increment: 1 } },
      }),
    );
  });
});
