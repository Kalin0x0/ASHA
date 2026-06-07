import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    autoscaleConfig: { findUnique: vi.fn() },
    deploymentZone: { findFirst: vi.fn() },
    server: { create: vi.fn() },
    serverPoolMember: { create: vi.fn() },
  },
}));
vi.mock('@chista/db', () => ({ prisma: prismaMock }));

import { AutoscaleRunnerService } from './autoscale-runner.service';

describe('AutoscaleRunnerService.runPool (D5)', () => {
  let createInstance: ReturnType<typeof vi.fn>;
  let pools: { planAutoscale: ReturnType<typeof vi.fn> };
  let providers: { driverFor: ReturnType<typeof vi.fn> };
  let svc: AutoscaleRunnerService;

  beforeEach(() => {
    vi.clearAllMocks();
    createInstance = vi.fn((spec: { name: string }) =>
      Promise.resolve({ id: `vm-${spec.name}`, name: spec.name, status: 'provisioning' }),
    );
    pools = { planAutoscale: vi.fn() };
    providers = { driverFor: vi.fn().mockResolvedValue({ createInstance }) };
    svc = new AutoscaleRunnerService(pools as never, providers as never);
    prismaMock.autoscaleConfig.findUnique.mockResolvedValue({ vmProviderId: 'p1' });
    prismaMock.deploymentZone.findFirst.mockResolvedValue({ id: 'z1' });
    prismaMock.server.create.mockImplementation((args: { data: { hostname: string } }) =>
      Promise.resolve({ id: `s-${args.data.hostname}` }),
    );
    prismaMock.serverPoolMember.create.mockResolvedValue({});
  });

  it('provisions `delta` instances on scale_up and tracks them as pool members', async () => {
    pools.planAutoscale.mockResolvedValue({ configured: true, action: 'scale_up', delta: 3 });
    const r = await svc.runPool('org1', 'pool1');
    expect(r).toMatchObject({ action: 'scale_up', delta: 3, created: 3 });
    expect(createInstance).toHaveBeenCalledTimes(3);
    expect(prismaMock.server.create).toHaveBeenCalledTimes(3);
    expect(prismaMock.serverPoolMember.create).toHaveBeenCalledTimes(3);
  });

  it('does nothing on action=none', async () => {
    pools.planAutoscale.mockResolvedValue({ configured: true, action: 'none', delta: 0 });
    expect(await svc.runPool('org1', 'pool1')).toMatchObject({ action: 'none', created: 0 });
    expect(createInstance).not.toHaveBeenCalled();
  });

  it('skips an unconfigured pool', async () => {
    pools.planAutoscale.mockResolvedValue({ configured: false });
    expect(await svc.runPool('org1', 'pool1')).toMatchObject({ skipped: 'unconfigured' });
  });

  it('no-ops when no VM provider is set', async () => {
    pools.planAutoscale.mockResolvedValue({ configured: true, action: 'scale_up', delta: 2 });
    prismaMock.autoscaleConfig.findUnique.mockResolvedValue({ vmProviderId: null });
    expect(await svc.runPool('org1', 'pool1')).toMatchObject({ created: 0, note: 'no VM provider' });
    expect(createInstance).not.toHaveBeenCalled();
  });
});
