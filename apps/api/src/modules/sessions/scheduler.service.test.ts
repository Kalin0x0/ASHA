import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    agent: { findMany: vi.fn(), updateMany: vi.fn() },
    deploymentZone: { findUnique: vi.fn(), findMany: vi.fn() },
  },
}));

vi.mock('@asha/db', () => ({ prisma: prismaMock }));

import { SchedulerService } from './scheduler.service';

const agent = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'a1',
  zoneId: 'z1',
  status: 'ONLINE',
  loadPercent: 10,
  maxSessions: 5,
  currentSessions: 0,
  lastHeartbeatAt: new Date(),
  ...over,
});

describe('SchedulerService.pickAgent', () => {
  let svc: SchedulerService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new SchedulerService();
    // Default: a single-zone org (cross-zone fallback finds no other zones).
    prismaMock.deploymentZone.findUnique.mockResolvedValue({ orgId: 'org1' });
    prismaMock.deploymentZone.findMany.mockResolvedValue([]);
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
    expect(picked?.currentSessions).toBe(1);
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
    prismaMock.agent.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });

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
        where: { id: 'a1', status: 'ONLINE' },
        data: { currentSessions: { increment: 1 } },
      }),
    );
  });

  it('spills over to another org zone when the primary is saturated (D7)', async () => {
    prismaMock.agent.findMany
      .mockResolvedValueOnce([agent({ id: 'a-sat', zoneId: 'zoneA', maxSessions: 1, currentSessions: 1 })])
      .mockResolvedValueOnce([agent({ id: 'b-free', zoneId: 'zoneB', maxSessions: 2, currentSessions: 0 })]);
    prismaMock.deploymentZone.findMany.mockResolvedValue([{ id: 'zoneB' }]);
    prismaMock.agent.updateMany.mockResolvedValue({ count: 1 });

    const picked = await svc.pickAgent('zoneA');
    expect(picked?.id).toBe('b-free');
    expect(prismaMock.deploymentZone.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ orgId: 'org1', id: { not: 'zoneA' } }) }),
    );
  });
});
