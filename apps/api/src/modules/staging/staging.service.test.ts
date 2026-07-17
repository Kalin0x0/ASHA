import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    sessionStaging: { findMany: vi.fn(), create: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn(), findFirst: vi.fn() },
    workspace: { findFirst: vi.fn() },
    deploymentZone: { findFirst: vi.fn() },
    session: { groupBy: vi.fn() },
  },
}));

vi.mock('@asha/db', () => ({ prisma: prismaMock }));

import { StagingService } from './staging.service';

const audit = { record: vi.fn().mockResolvedValue(undefined) };

describe('StagingService', () => {
  let svc: StagingService;
  let sessions: { stagingMountConflict: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    sessions = { stagingMountConflict: vi.fn().mockResolvedValue(null) };
    svc = new StagingService(audit as never, sessions as never);
  });

  it('refuses staging when the workspace is in another org', async () => {
    prismaMock.workspace.findFirst.mockResolvedValue(null);
    prismaMock.deploymentZone.findFirst.mockResolvedValue({ id: 'z1' });
    await expect(
      svc.create('org1', 'u1', { workspaceId: 'foreign', zoneId: 'z1', desiredSessions: 2, enabled: true }),
    ).rejects.toThrow('Workspace not found');
  });

  it('creates a staging rule when workspace + zone are valid', async () => {
    prismaMock.workspace.findFirst.mockResolvedValue({ id: 'w1', type: 'CONTAINER' });
    prismaMock.deploymentZone.findFirst.mockResolvedValue({ id: 'z1' });
    prismaMock.sessionStaging.create.mockResolvedValue({ id: 'st1' });
    await svc.create('org1', 'u1', { workspaceId: 'w1', zoneId: 'z1', desiredSessions: 3, enabled: true });
    expect(prismaMock.sessionStaging.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ orgId: 'org1', desiredSessions: 3 }) }),
    );
  });

  it('refuses to stage a non-container workspace', async () => {
    prismaMock.workspace.findFirst.mockResolvedValue({ id: 'w1', type: 'SERVER' });
    prismaMock.deploymentZone.findFirst.mockResolvedValue({ id: 'z1' });
    await expect(
      svc.create('org1', 'u1', { workspaceId: 'w1', zoneId: 'z1', desiredSessions: 1, enabled: true }),
    ).rejects.toThrow('container');
  });

  it('refuses to stage when the org uses per-user mounts', async () => {
    prismaMock.workspace.findFirst.mockResolvedValue({ id: 'w1', type: 'CONTAINER' });
    prismaMock.deploymentZone.findFirst.mockResolvedValue({ id: 'z1' });
    sessions.stagingMountConflict.mockResolvedValue('per-user volume mounts');
    await expect(
      svc.create('org1', 'u1', { workspaceId: 'w1', zoneId: 'z1', desiredSessions: 1, enabled: true }),
    ).rejects.toThrow('per-user');
  });

  it('throws 404 updating a staging rule in another org', async () => {
    prismaMock.sessionStaging.updateMany.mockResolvedValue({ count: 0 });
    await expect(svc.update('org1', 'u1', 'foreign', { desiredSessions: 0 })).rejects.toThrow('not found');
  });

  it('enriches rules with the REAL fill level (ready = unclaimed RUNNING, warming = provisioning)', async () => {
    prismaMock.sessionStaging.findMany.mockResolvedValue([
      { id: 'r1', desiredSessions: 2 },
      { id: 'r2', desiredSessions: 1 },
    ]);
    prismaMock.session.groupBy.mockResolvedValue([
      { stagingId: 'r1', status: 'RUNNING', _count: 2 },
      { stagingId: 'r2', status: 'PROVISIONING', _count: 1 },
    ]);
    const rules = await svc.list('org1');
    expect(rules).toEqual([
      expect.objectContaining({ id: 'r1', readyCount: 2, warmingCount: 0 }),
      expect.objectContaining({ id: 'r2', readyCount: 0, warmingCount: 1 }),
    ]);
    // Only UNCLAIMED pool sessions count — claimed ones belong to their user.
    expect(prismaMock.session.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: null }) }),
    );
  });

  it('skips the count query when there are no rules', async () => {
    prismaMock.sessionStaging.findMany.mockResolvedValue([]);
    await expect(svc.list('org1')).resolves.toEqual([]);
    expect(prismaMock.session.groupBy).not.toHaveBeenCalled();
  });
});
