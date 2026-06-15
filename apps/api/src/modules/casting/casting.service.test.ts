import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    castingConfig: { findMany: vi.fn(), create: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn(), findFirst: vi.fn() },
    workspace: { findFirst: vi.fn() },
  },
}));

vi.mock('@chista/db', () => ({ prisma: prismaMock }));

import { CastingService } from './casting.service';

const audit = { record: vi.fn().mockResolvedValue(undefined) };

describe('CastingService', () => {
  let svc: CastingService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new CastingService(audit as never);
  });

  it('refuses casting a workspace from another org', async () => {
    prismaMock.workspace.findFirst.mockResolvedValue(null);
    await expect(
      svc.create('org1', 'u1', { workspaceId: 'foreign', allowAnonymous: false, requireAuth: true, enabled: true }),
    ).rejects.toThrow('Workspace not found');
  });

  it('generates a public key when creating a cast', async () => {
    prismaMock.workspace.findFirst.mockResolvedValue({ id: 'w1' });
    prismaMock.castingConfig.create.mockResolvedValue({ id: 'c1', key: 'generated' });
    await svc.create('org1', 'u1', { workspaceId: 'w1', allowAnonymous: true, requireAuth: false, enabled: true });
    const arg = prismaMock.castingConfig.create.mock.calls[0][0];
    expect(arg.data.orgId).toBe('org1');
    expect(typeof arg.data.key).toBe('string');
    expect(arg.data.key.length).toBeGreaterThan(8);
  });

  it('throws 404 deleting a cast in another org', async () => {
    prismaMock.castingConfig.deleteMany.mockResolvedValue({ count: 0 });
    await expect(svc.remove('org1', 'u1', 'foreign')).rejects.toThrow('not found');
  });
});
