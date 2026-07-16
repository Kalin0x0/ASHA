import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, txMock, PrismaMock } = vi.hoisted(() => {
  const txMock = {
    deploymentZone: { updateMany: vi.fn(), create: vi.fn() },
  };
  // Stand-in for the real Prisma error class so `instanceof` in the service's
  // P2003 handler resolves against the same constructor the tests throw.
  class PrismaClientKnownRequestError extends Error {
    code: string;
    constructor(message: string, opts: { code: string }) {
      super(message);
      this.code = opts.code;
    }
  }
  return {
    txMock,
    PrismaMock: { PrismaClientKnownRequestError },
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

vi.mock('@asha/db', () => ({ prisma: prismaMock, Prisma: PrismaMock }));

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

  // Regression: past sessions used to block deletion at the FK (Session.zoneId
  // was required → RESTRICT), surfacing as a raw 500. Only LIVE sessions may
  // count; history is detached by onDelete: SetNull.
  it('ignores finished sessions when deciding whether a zone is deletable', async () => {
    prismaMock.deploymentZone.findFirst.mockResolvedValue({
      id: 'z2', orgId: 'org1', isDefault: false, _count: { agents: 0, servers: 0 },
    });
    prismaMock.session.count.mockResolvedValue(0);
    await expect(svc.remove('org1', 'u1', 'z2')).resolves.toEqual({ ok: true });
    expect(prismaMock.session.count).toHaveBeenCalledWith({
      where: {
        zoneId: 'z2',
        orgId: 'org1',
        status: { notIn: ['DESTROYED', 'TERMINATING', 'ERROR'] },
      },
    });
  });

  it('translates a late FK violation into a 409 instead of leaking a 500', async () => {
    prismaMock.deploymentZone.findFirst.mockResolvedValue({
      id: 'z2', orgId: 'org1', isDefault: false, _count: { agents: 0, servers: 0 },
    });
    prismaMock.session.count.mockResolvedValue(0); // clear at check time…
    prismaMock.deploymentZone.deleteMany.mockRejectedValue(
      // …but something claimed the zone before the delete landed.
      new PrismaMock.PrismaClientKnownRequestError('FK violated', { code: 'P2003' }),
    );
    await expect(svc.remove('org1', 'u1', 'z2')).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining('just claimed'),
    });
  });

  it('does not swallow unexpected delete failures', async () => {
    prismaMock.deploymentZone.findFirst.mockResolvedValue({
      id: 'z2', orgId: 'org1', isDefault: false, _count: { agents: 0, servers: 0 },
    });
    prismaMock.session.count.mockResolvedValue(0);
    prismaMock.deploymentZone.deleteMany.mockRejectedValue(new Error('connection reset'));
    await expect(svc.remove('org1', 'u1', 'z2')).rejects.toThrow('connection reset');
  });
});
