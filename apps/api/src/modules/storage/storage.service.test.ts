import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    volumeMapping: { findMany: vi.fn(), create: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn(), findUnique: vi.fn() },
    fileMapping: { findMany: vi.fn(), create: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn(), findUnique: vi.fn() },
    persistentProfile: { findMany: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
  },
}));

vi.mock('@chista/db', () => ({ prisma: prismaMock }));

import { StorageService } from './storage.service';

describe('StorageService — org scoping', () => {
  let svc: StorageService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new StorageService();
  });

  it('lists volumes scoped to the org', async () => {
    prismaMock.volumeMapping.findMany.mockResolvedValue([]);
    await svc.listVolumes('org1');
    expect(prismaMock.volumeMapping.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orgId: 'org1' } }),
    );
  });

  it('updates a volume with an org-scoped where clause', async () => {
    prismaMock.volumeMapping.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.volumeMapping.findUnique.mockResolvedValue({ id: 'v1' });
    await svc.updateVolume('org1', 'v1', { readOnly: true });
    expect(prismaMock.volumeMapping.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'v1', orgId: 'org1' } }),
    );
  });

  it('throws 404 when updating a volume in another org', async () => {
    prismaMock.volumeMapping.updateMany.mockResolvedValue({ count: 0 });
    await expect(svc.updateVolume('org1', 'foreign', { readOnly: true })).rejects.toThrow('not found');
  });

  it('throws 404 when deleting a non-existent file mapping', async () => {
    prismaMock.fileMapping.deleteMany.mockResolvedValue({ count: 0 });
    await expect(svc.removeFile('org1', 'ghost')).rejects.toThrow('not found');
  });

  it('creates a file mapping under the caller org', async () => {
    prismaMock.fileMapping.create.mockResolvedValue({ id: 'f1' });
    await svc.createFile('org1', {
      name: 'ca-cert',
      target: 'CONTAINER',
      sourcePath: '/src',
      destPath: '/etc/ssl/ca.pem',
      isHomeProfile: false,
      scope: 'WORKSPACE',
    });
    expect(prismaMock.fileMapping.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ orgId: 'org1', name: 'ca-cert' }) }),
    );
  });

  it('removes a persistent profile org-scoped', async () => {
    prismaMock.persistentProfile.deleteMany.mockResolvedValue({ count: 1 });
    const res = await svc.removeProfile('org1', 'p1');
    expect(prismaMock.persistentProfile.deleteMany).toHaveBeenCalledWith({ where: { id: 'p1', orgId: 'org1' } });
    expect(res).toEqual({ ok: true });
  });
});
