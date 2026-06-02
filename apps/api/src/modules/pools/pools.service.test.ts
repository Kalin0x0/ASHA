import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, txMock } = vi.hoisted(() => {
  const txMock = {
    autoscaleConfig: { upsert: vi.fn() },
    autoscaleSchedule: { deleteMany: vi.fn(), createMany: vi.fn() },
  };
  return {
    txMock,
    prismaMock: {
      serverPool: { findMany: vi.fn(), create: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn(), findFirst: vi.fn() },
      autoscaleConfig: { findUnique: vi.fn(), deleteMany: vi.fn() },
      $transaction: vi.fn(async (fn: (tx: typeof txMock) => unknown) => fn(txMock)),
    },
  };
});

vi.mock('@chista/db', () => ({ prisma: prismaMock }));

import { PoolsService } from './pools.service';

const audit = { record: vi.fn().mockResolvedValue(undefined) };

describe('PoolsService', () => {
  let svc: PoolsService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new PoolsService(audit as never);
  });

  it('throws 404 setting autoscale on a pool in another org', async () => {
    prismaMock.serverPool.findFirst.mockResolvedValue(null);
    await expect(
      svc.upsertAutoscale('org1', 'u1', 'foreign', {
        mode: 'SCHEDULE',
        minStandby: 0,
        maxInstances: 1,
        perServerSessionLimit: 1,
        checkinIntervalSec: 60,
        downscaleBackoffSec: 300,
      }),
    ).rejects.toThrow('Pool not found');
  });

  it('replaces the schedule grid when schedules are provided', async () => {
    prismaMock.serverPool.findFirst.mockResolvedValue({ id: 'p1', orgId: 'org1' });
    txMock.autoscaleConfig.upsert.mockResolvedValue({ id: 'ac1' });
    prismaMock.autoscaleConfig.findUnique.mockResolvedValue({ id: 'ac1', schedules: [] });

    await svc.upsertAutoscale('org1', 'u1', 'p1', {
      mode: 'SCHEDULE',
      minStandby: 1,
      maxInstances: 5,
      perServerSessionLimit: 2,
      checkinIntervalSec: 60,
      downscaleBackoffSec: 300,
      schedules: [{ dayOfWeek: 1, hour: 9, minStandby: 3, maxInstances: 5 }],
    });

    // Old grid wiped, new grid inserted
    expect(txMock.autoscaleSchedule.deleteMany).toHaveBeenCalledWith({ where: { autoscaleConfigId: 'ac1' } });
    expect(txMock.autoscaleSchedule.createMany).toHaveBeenCalledWith({
      data: [{ autoscaleConfigId: 'ac1', dayOfWeek: 1, hour: 9, minStandby: 3, maxInstances: 5 }],
    });
  });

  it('throws 404 deleting autoscale that does not exist', async () => {
    prismaMock.autoscaleConfig.deleteMany.mockResolvedValue({ count: 0 });
    await expect(svc.removeAutoscale('org1', 'u1', 'p1')).rejects.toThrow('not found');
  });

  it('creates a pool under the caller org', async () => {
    prismaMock.serverPool.create.mockResolvedValue({ id: 'p1' });
    await svc.create('org1', 'u1', { name: 'gpu-pool', kind: 'AGENT', enabled: true });
    expect(prismaMock.serverPool.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ orgId: 'org1', name: 'gpu-pool' }) }),
    );
  });
});
