import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    volumeMapping: { findMany: vi.fn(), create: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn(), findUnique: vi.fn() },
    fileMapping: { findMany: vi.fn(), create: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn(), findUnique: vi.fn() },
    persistentProfile: { findMany: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
    storageMapping: { findMany: vi.fn(), create: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn(), findFirst: vi.fn() },
  },
}));

vi.mock('@asha/db', () => ({ prisma: prismaMock }));

import { StorageService } from './storage.service';

const env = { SECRET_SEAL_KEY: '0123456789abcdef0123456789abcdef' } as never;

describe('StorageService — org scoping', () => {
  let svc: StorageService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new StorageService(env);
  });

  it('seals storage-mapping secrets into secretRef and redacts the stored config', async () => {
    prismaMock.storageMapping.create.mockResolvedValue({ id: 'sm1' });
    await svc.createStorageMapping('org1', {
      name: 's3',
      kind: 'S3' as never,
      mountPath: '/mnt/s3',
      readOnly: false,
      scope: 'GROUP' as never,
      config: { bucket: 'b', accessKeyId: 'AKIA', secretAccessKey: 'super-secret' },
      enabled: true,
    } as never);
    const data = prismaMock.storageMapping.create.mock.calls[0][0].data;
    expect(JSON.stringify(data.config)).not.toContain('super-secret');
    expect((data.config as Record<string, unknown>).secretAccessKey).toBe('••••••••');
    expect((data.config as Record<string, unknown>).bucket).toBe('b');
    expect(typeof data.secretRef).toBe('string');
    expect(data.secretRef).not.toContain('super-secret');
  });

  it('resolveStorageConfig unseals the original secret', async () => {
    prismaMock.storageMapping.create.mockResolvedValue({ id: 'sm2' });
    await svc.createStorageMapping('org1', {
      name: 's3b', kind: 'S3' as never, mountPath: '/mnt', readOnly: false, scope: 'GROUP' as never,
      config: { bucket: 'b', secretAccessKey: 'unseal-me' }, enabled: true,
    } as never);
    const sealed = prismaMock.storageMapping.create.mock.calls[0][0].data.secretRef;
    prismaMock.storageMapping.findFirst.mockResolvedValue({ id: 'sm2', secretRef: sealed, config: {} });
    const resolved = await svc.resolveStorageConfig('org1', 'sm2');
    expect(resolved?.secretAccessKey).toBe('unseal-me');
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
