import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    sessionStaging: { findMany: vi.fn(), create: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn(), findFirst: vi.fn() },
    workspace: { findFirst: vi.fn() },
    deploymentZone: { findFirst: vi.fn() },
  },
}));

vi.mock('@chista/db', () => ({ prisma: prismaMock }));

import { StagingService } from './staging.service';

const audit = { record: vi.fn().mockResolvedValue(undefined) };

describe('StagingService', () => {
  let svc: StagingService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new StagingService(audit as never);
  });

  it('refuses staging when the workspace is in another org', async () => {
    prismaMock.workspace.findFirst.mockResolvedValue(null);
    prismaMock.deploymentZone.findFirst.mockResolvedValue({ id: 'z1' });
    await expect(
      svc.create('org1', 'u1', { workspaceId: 'foreign', zoneId: 'z1', desiredSessions: 2, enabled: true }),
    ).rejects.toThrow('Workspace not found');
  });

  it('creates a staging rule when workspace + zone are valid', async () => {
    prismaMock.workspace.findFirst.mockResolvedValue({ id: 'w1' });
    prismaMock.deploymentZone.findFirst.mockResolvedValue({ id: 'z1' });
    prismaMock.sessionStaging.create.mockResolvedValue({ id: 'st1' });
    await svc.create('org1', 'u1', { workspaceId: 'w1', zoneId: 'z1', desiredSessions: 3, enabled: true });
    expect(prismaMock.sessionStaging.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ orgId: 'org1', desiredSessions: 3 }) }),
    );
  });

  it('throws 404 updating a staging rule in another org', async () => {
    prismaMock.sessionStaging.updateMany.mockResolvedValue({ count: 0 });
    await expect(svc.update('org1', 'u1', 'foreign', { desiredSessions: 0 })).rejects.toThrow('not found');
  });
});
