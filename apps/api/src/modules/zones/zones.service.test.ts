import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, txMock } = vi.hoisted(() => {
  const txMock = {
    deploymentZone: { updateMany: vi.fn(), create: vi.fn() },
  };
  return {
    txMock,
    prismaMock: {
      deploymentZone: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        updateMany: vi.fn(),
        deleteMany: vi.fn(),
      },
      session: { count: vi.fn() },
      $transaction: vi.fn(async (fn: (tx: typeof txMock) => unknown) => fn(txMock)),
    },
  };
});

vi.mock('@chista/db', () => ({ prisma: prismaMock }));

import { ZonesService } from './zones.service';

const audit = { record: vi.fn().mockResolvedValue(undefined) };

describe('ZonesService', () => {
  let svc: ZonesService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new ZonesService(audit as never);
  });

  it('demotes the previous default when creating a new default zone', async () => {
    txMock.deploymentZone.create.mockResolvedValue({ id: 'z1', isDefault: true });
    await svc.create('org1', 'u1', { name: 'eu', isDefault: true, settings: {} });
    // First the bulk demote, scoped to the org
    expect(txMock.deploymentZone.updateMany).toHaveBeenCalledWith({
      where: { orgId: 'org1' },
      data: { isDefault: false },
    });
    expect(txMock.deploymentZone.create).toHaveBeenCalled();
  });

  it('does NOT demote when creating a non-default zone', async () => {
    txMock.deploymentZone.create.mockResolvedValue({ id: 'z2', isDefault: false });
    await svc.create('org1', 'u1', { name: 'us', isDefault: false, settings: {} });
    expect(txMock.deploymentZone.updateMany).not.toHaveBeenCalled();
  });

  it('refuses to delete the default zone', async () => {
    prismaMock.deploymentZone.findFirst.mockResolvedValue({
      id: 'z1', orgId: 'org1', isDefault: true, _count: { agents: 0, servers: 0 },
    });
    await expect(svc.remove('org1', 'u1', 'z1')).rejects.toThrow('default zone');
    expect(prismaMock.deploymentZone.deleteMany).not.toHaveBeenCalled();
  });

  it('deletes a non-default zone with no active sessions, agents or servers', async () => {
    prismaMock.deploymentZone.findFirst.mockResolvedValue({
      id: 'z2', orgId: 'org1', isDefault: false, _count: { agents: 0, servers: 0 },
    });
    prismaMock.session.count.mockResolvedValue(0);
    await expect(svc.remove('org1', 'u1', 'z2')).resolves.toEqual({ ok: true });
    expect(prismaMock.deploymentZone.deleteMany).toHaveBeenCalledWith({ where: { id: 'z2', orgId: 'org1' } });
  });

  it('refuses to delete a non-default zone that still has active sessions', async () => {
    prismaMock.deploymentZone.findFirst.mockResolvedValue({
      id: 'z2', orgId: 'org1', isDefault: false, _count: { agents: 0, servers: 0 },
    });
    prismaMock.session.count.mockResolvedValue(3);
    await expect(svc.remove('org1', 'u1', 'z2')).rejects.toThrow('active session');
    expect(prismaMock.deploymentZone.deleteMany).not.toHaveBeenCalled();
  });

  it('refuses to delete a non-default zone that still has agents or servers', async () => {
    prismaMock.deploymentZone.findFirst.mockResolvedValue({
      id: 'z2', orgId: 'org1', isDefault: false, _count: { agents: 2, servers: 0 },
    });
    prismaMock.session.count.mockResolvedValue(0);
    await expect(svc.remove('org1', 'u1', 'z2')).rejects.toThrow('agents or servers');
    expect(prismaMock.deploymentZone.deleteMany).not.toHaveBeenCalled();
  });

  it('throws 404 when deleting a zone in another org', async () => {
    prismaMock.deploymentZone.findFirst.mockResolvedValue(null);
    await expect(svc.remove('org1', 'u1', 'foreign')).rejects.toThrow('not found');
  });
});
