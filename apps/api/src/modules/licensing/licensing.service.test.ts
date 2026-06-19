import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    license: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    session: { count: vi.fn(), groupBy: vi.fn() },
    licenseUsageSample: { create: vi.fn() },
  },
}));

vi.mock('@asha/db', () => ({ prisma: prismaMock }));

import { LicensingService } from './licensing.service';

const audit = { record: vi.fn().mockResolvedValue(undefined) };

describe('LicensingService.assertCanLaunch', () => {
  let svc: LicensingService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new LicensingService(audit as never);
  });

  it('allows unlimited launches when no license exists (community)', async () => {
    prismaMock.license.findFirst.mockResolvedValue(null);
    await expect(svc.assertCanLaunch('org1', 'u1')).resolves.toBeUndefined();
    expect(prismaMock.session.count).not.toHaveBeenCalled();
  });

  it('blocks when the concurrent cap is reached', async () => {
    prismaMock.license.findFirst.mockResolvedValue({ id: 'l1', type: 'CONCURRENT', concurrentSessions: 2, seats: 5 });
    prismaMock.session.count.mockResolvedValue(2);
    await expect(svc.assertCanLaunch('org1', 'u1')).rejects.toThrow(/Concurrent session limit/);
  });

  it('allows when below the concurrent cap', async () => {
    prismaMock.license.findFirst.mockResolvedValue({ id: 'l1', type: 'CONCURRENT', concurrentSessions: 5, seats: 5 });
    prismaMock.session.count.mockResolvedValue(1);
    await expect(svc.assertCanLaunch('org1', 'u1')).resolves.toBeUndefined();
  });

  it('rejects an expired license window', async () => {
    prismaMock.license.findFirst.mockResolvedValue({
      id: 'l1',
      type: 'CONCURRENT',
      concurrentSessions: 5,
      seats: 5,
      notAfter: new Date(Date.now() - 1000),
    });
    await expect(svc.assertCanLaunch('org1', 'u1')).rejects.toThrow(/expired/);
  });

  it('NAMED_USER: blocks a new user once seats are full but allows an existing seat-holder', async () => {
    prismaMock.license.findFirst.mockResolvedValue({ id: 'l1', type: 'NAMED_USER', seats: 2, concurrentSessions: 99 });
    prismaMock.session.groupBy.mockResolvedValue([{ userId: 'a' }, { userId: 'b' }]);
    await expect(svc.assertCanLaunch('org1', 'c')).rejects.toThrow(/seat limit/);
    await expect(svc.assertCanLaunch('org1', 'a')).resolves.toBeUndefined();
  });
});

describe('LicensingService.usage', () => {
  let svc: LicensingService;
  beforeEach(() => {
    vi.clearAllMocks();
    svc = new LicensingService(audit as never);
  });

  it('reports used vs allowed and records a usage sample', async () => {
    prismaMock.license.findFirst.mockResolvedValue({ id: 'l1', type: 'CONCURRENT', concurrentSessions: 10, seats: 20 });
    prismaMock.session.count.mockResolvedValue(3);
    prismaMock.session.groupBy.mockResolvedValue([{ userId: 'a' }, { userId: 'b' }]);
    const out = await svc.usage('org1');
    expect(out).toMatchObject({ usedConcurrent: 3, usedSeats: 2, licensed: true, concurrentSessions: 10 });
    expect(prismaMock.licenseUsageSample.create).toHaveBeenCalled();
  });
});
