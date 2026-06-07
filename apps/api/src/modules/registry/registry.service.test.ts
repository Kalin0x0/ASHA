import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    registry: { findMany: vi.fn(), create: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    registryEntry: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    image: { create: vi.fn(), findFirst: vi.fn() },
    workspace: { create: vi.fn(), findFirst: vi.fn() },
  },
}));

vi.mock('@chista/db', () => ({ prisma: prismaMock }));

import { RegistryService } from './registry.service';

const audit = { record: vi.fn().mockResolvedValue(undefined) };

describe('RegistryService.syncRegistry', () => {
  let svc: RegistryService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new RegistryService(audit as never);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches the index, upserts entries, and stamps lastSyncedAt', async () => {
    prismaMock.registry.findFirst.mockResolvedValue({ id: 'r1', url: 'https://reg/index.json' });
    prismaMock.registryEntry.findFirst.mockResolvedValue(null);
    prismaMock.registryEntry.create.mockResolvedValue({});
    prismaMock.registry.update.mockResolvedValue({});

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          { name: 'firefox', dockerImage: 'kasmweb/firefox:1.16.0', friendlyName: 'Firefox' },
          { name: 'no-image' }, // skipped: missing dockerImage
        ],
      }),
    );

    const res = await svc.syncRegistry('org1', 'u1', 'r1');
    expect(res).toEqual({ ok: true, upserted: 1 });
    expect(prismaMock.registryEntry.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.registry.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ lastSyncedAt: expect.any(Date) }) }),
    );
  });

  it('accepts a { workspaces: [...] } wrapper shape', async () => {
    prismaMock.registry.findFirst.mockResolvedValue({ id: 'r1', url: 'https://reg/index.json' });
    prismaMock.registryEntry.findFirst.mockResolvedValue(null);
    prismaMock.registryEntry.create.mockResolvedValue({});
    prismaMock.registry.update.mockResolvedValue({});
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ workspaces: [{ name: 'chrome', dockerImage: 'kasmweb/chrome:1.16.0' }] }),
      }),
    );
    const res = await svc.syncRegistry('org1', 'u1', 'r1');
    expect(res.upserted).toBe(1);
  });

  it('throws a 400 when the index fetch fails', async () => {
    prismaMock.registry.findFirst.mockResolvedValue({ id: 'r1', url: 'https://reg/index.json' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 502 }));
    await expect(svc.syncRegistry('org1', 'u1', 'r1')).rejects.toThrow(/sync failed/);
  });
});

describe('RegistryService.install', () => {
  let svc: RegistryService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new RegistryService(audit as never);
  });

  it('materialises an Image and, when asked, a Workspace; marks entry installed', async () => {
    prismaMock.registryEntry.findFirst.mockResolvedValue({
      id: 'e1',
      name: 'firefox',
      friendlyName: 'Firefox',
      description: 'browser',
      dockerImage: 'kasmweb/firefox:1.16.0',
      categories: ['Browsers'],
      iconUrl: null,
    });
    prismaMock.image.create.mockResolvedValue({ id: 'img1' });
    prismaMock.workspace.create.mockResolvedValue({ id: 'ws1' });
    prismaMock.registryEntry.update.mockResolvedValue({});

    const res = await svc.install('org1', 'u1', 'e1', { createWorkspace: true });
    expect(res).toEqual({ ok: true, imageId: 'img1', workspaceId: 'ws1' });
    expect(prismaMock.image.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ sourceRegistryEntryId: 'e1' }) }),
    );
    expect(prismaMock.registryEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { installed: true } }),
    );
  });

  it('creates only an Image when createWorkspace is false', async () => {
    prismaMock.registryEntry.findFirst.mockResolvedValue({
      id: 'e1', name: 'x', friendlyName: 'X', description: null, dockerImage: 'x:1', categories: [], iconUrl: null,
    });
    prismaMock.image.create.mockResolvedValue({ id: 'img2' });
    prismaMock.registryEntry.update.mockResolvedValue({});
    const res = await svc.install('org1', 'u1', 'e1', { createWorkspace: false });
    expect(res.workspaceId).toBeUndefined();
    expect(prismaMock.workspace.create).not.toHaveBeenCalled();
  });

  it('404s for an entry outside the org', async () => {
    prismaMock.registryEntry.findFirst.mockResolvedValue(null);
    await expect(svc.install('org1', 'u1', 'ghost', { createWorkspace: false })).rejects.toThrow(/not found/);
  });
});
