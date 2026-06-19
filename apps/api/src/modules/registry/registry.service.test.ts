import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    registry: { findMany: vi.fn(), create: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    registryEntry: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    image: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), delete: vi.fn(), count: vi.fn() },
    workspace: { create: vi.fn(), findFirst: vi.fn(), deleteMany: vi.fn() },
    session: { count: vi.fn() },
    agent: { findMany: vi.fn() },
  },
}));

vi.mock('@chista/db', () => ({ prisma: prismaMock }));

import { normalizeIndex, RegistryService } from './registry.service';

const audit = { record: vi.fn().mockResolvedValue(undefined) };
const redis = { publish: vi.fn().mockResolvedValue(undefined) };

describe('RegistryService.syncRegistry', () => {
  let svc: RegistryService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new RegistryService(audit as never, redis as never);
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
    svc = new RegistryService(audit as never, redis as never);
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

  it('defaults LinuxServer.io (lscr.io) images to the 3001 KasmVNC port', async () => {
    prismaMock.registryEntry.findFirst.mockResolvedValue({
      id: 'e1',
      name: 'kali-linux',
      friendlyName: 'Kali Linux',
      description: null,
      dockerImage: 'lscr.io/linuxserver/kali-linux:latest',
      categories: [],
      iconUrl: null,
      raw: {},
    });
    prismaMock.image.create.mockResolvedValue({ id: 'img3' });
    prismaMock.registryEntry.update.mockResolvedValue({});
    await svc.install('org1', 'u1', 'e1', { createWorkspace: false });
    expect(prismaMock.image.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ runConfigDefaults: expect.objectContaining({ ports: [3001] }) }),
      }),
    );
  });

  it('404s for an entry outside the org', async () => {
    prismaMock.registryEntry.findFirst.mockResolvedValue(null);
    await expect(svc.install('org1', 'u1', 'ghost', { createWorkspace: false })).rejects.toThrow(/not found/);
  });
});

describe('RegistryService — digest pinning + pull policy (A3)', () => {
  let svc: RegistryService;

  const headRes = (digest: string | null, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (h: string) => (h.toLowerCase() === 'docker-content-digest' ? digest : null) },
  });

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new RegistryService(audit as never, redis as never);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('resolveDigest returns the content digest from an explicit registry (direct 200)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(headRes('sha256:abc123'));
    vi.stubGlobal('fetch', fetchMock);
    expect(await svc.resolveDigest('myreg.io/team/app:1.2')).toBe('sha256:abc123');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://myreg.io/v2/team/app/manifests/1.2',
      expect.objectContaining({ method: 'HEAD' }),
    );
  });

  it('resolveDigest handles a Docker Hub bearer challenge + library/ prefix', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        headers: {
          get: (h: string) =>
            h.toLowerCase() === 'www-authenticate'
              ? 'Bearer realm="https://auth.docker.io/token",service="registry.docker.io"'
              : null,
        },
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ token: 'TKN' }) })
      .mockResolvedValueOnce(headRes('sha256:hub'));
    vi.stubGlobal('fetch', fetchMock);

    expect(await svc.resolveDigest('nginx:latest')).toBe('sha256:hub');
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://registry-1.docker.io/v2/library/nginx/manifests/latest',
      expect.objectContaining({ method: 'HEAD' }),
    );
    expect(fetchMock.mock.calls[1]![0]).toContain('scope=repository%3Alibrary%2Fnginx%3Apull');
    expect(fetchMock.mock.calls[2]![1].headers.Authorization).toBe('Bearer TKN');
  });

  it('resolveDigest throws when no digest header is returned', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(headRes(null)));
    await expect(svc.resolveDigest('x:1')).rejects.toThrow(/No content digest/);
  });

  it('promoteImage pins the org image to its resolved digest (org-scoped)', async () => {
    prismaMock.image.findFirst.mockResolvedValue({ id: 'img1', dockerImage: 'team/app:1.2', orgId: 'org1' });
    prismaMock.image.update.mockResolvedValue({ id: 'img1', dockerImage: 'team/app:1.2', digest: 'sha256:zzz' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(headRes('sha256:zzz')));

    expect(await svc.promoteImage('org1', 'u1', 'img1')).toMatchObject({ digest: 'sha256:zzz' });
    expect(prismaMock.image.findFirst).toHaveBeenCalledWith({ where: { id: 'img1', orgId: 'org1' } });
    expect(prismaMock.image.update).toHaveBeenCalledWith(expect.objectContaining({ data: { digest: 'sha256:zzz' } }));
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'image.promote' }));
  });

  it('promoteImage 404s for a non-org (e.g. global) image', async () => {
    prismaMock.image.findFirst.mockResolvedValue(null);
    await expect(svc.promoteImage('org1', 'u1', 'global1')).rejects.toThrow(/not found/i);
  });

  it('setPullPolicy updates an org image only', async () => {
    prismaMock.image.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.image.findUnique.mockResolvedValue({ id: 'img1', pullPolicy: 'IF_NOT_PRESENT' });
    expect(await svc.setPullPolicy('org1', 'u1', 'img1', 'IF_NOT_PRESENT')).toMatchObject({ pullPolicy: 'IF_NOT_PRESENT' });
    expect(prismaMock.image.updateMany).toHaveBeenCalledWith({
      where: { id: 'img1', orgId: 'org1' },
      data: { pullPolicy: 'IF_NOT_PRESENT' },
    });
  });

  it('setPullPolicy 404s when nothing matched', async () => {
    prismaMock.image.updateMany.mockResolvedValue({ count: 0 });
    await expect(svc.setPullPolicy('org1', 'u1', 'ghost', 'NEVER')).rejects.toThrow(/not found/i);
  });

  it('deleteImage removes the image + workspaces, unmarks the entry, and frees host disk', async () => {
    prismaMock.image.findFirst.mockResolvedValue({ id: 'img1', orgId: 'org1', dockerImage: 'x:1', sourceRegistryEntryId: 'mk1' });
    prismaMock.session.count.mockResolvedValue(0);
    prismaMock.image.count.mockResolvedValue(0); // not shared → host image safe to remove
    prismaMock.workspace.deleteMany.mockResolvedValue({ count: 1 });
    prismaMock.registryEntry.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.image.delete.mockResolvedValue({ id: 'img1' });
    prismaMock.agent.findMany.mockResolvedValue([{ zone: { name: 'default' } }]);

    expect(await svc.deleteImage('org1', 'u1', 'img1')).toEqual({
      ok: true,
      hostImageRemoved: true,
      sharedWithOtherImages: false,
    });
    expect(prismaMock.workspace.deleteMany).toHaveBeenCalledWith({ where: { orgId: 'org1', imageId: 'img1' } });
    expect(prismaMock.registryEntry.updateMany).toHaveBeenCalledWith({ where: { id: 'mk1' }, data: { installed: false } });
    expect(prismaMock.image.delete).toHaveBeenCalledWith({ where: { id: 'img1' } });
    // Host disk reclaimed: a REMOVE command is published to the zone's agent.
    expect(redis.publish).toHaveBeenCalledWith(
      'chista:zone:default:image',
      expect.objectContaining({ action: 'REMOVE', dockerImage: 'x:1' }),
    );
  });

  it('deleteImage blocks while a live session still uses the image', async () => {
    prismaMock.image.findFirst.mockResolvedValue({ id: 'img1', orgId: 'org1', dockerImage: 'x:1' });
    prismaMock.session.count.mockResolvedValue(2);
    await expect(svc.deleteImage('org1', 'u1', 'img1')).rejects.toThrow(/in use by 2 active session/i);
    expect(prismaMock.image.delete).not.toHaveBeenCalled();
    expect(redis.publish).not.toHaveBeenCalled();
  });

  it('deleteImage keeps the host image when another image shares the Docker tag', async () => {
    prismaMock.image.findFirst.mockResolvedValue({ id: 'img1', orgId: 'org1', dockerImage: 'x:1', sourceRegistryEntryId: null });
    prismaMock.session.count.mockResolvedValue(0);
    prismaMock.image.count.mockResolvedValue(1); // another image references x:1
    prismaMock.workspace.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.image.delete.mockResolvedValue({ id: 'img1' });

    expect(await svc.deleteImage('org1', 'u1', 'img1')).toEqual({
      ok: true,
      hostImageRemoved: false,
      sharedWithOtherImages: true,
    });
    expect(redis.publish).not.toHaveBeenCalled();
  });

  it('deleteImage 404s for an unknown image', async () => {
    prismaMock.image.findFirst.mockResolvedValue(null);
    await expect(svc.deleteImage('org1', 'u1', 'ghost')).rejects.toThrow(/not found/i);
  });

  it('reinstallImage re-materialises from the entry and re-pulls the image', async () => {
    prismaMock.image.findFirst.mockResolvedValue({ id: 'img1', orgId: 'org1', dockerImage: 'x:1', friendlyName: 'X', sourceRegistryEntryId: 'mk1' });
    // install() path: look up the entry, upsert the image, mark installed.
    prismaMock.registryEntry.findFirst.mockResolvedValue({ id: 'mk1', name: 'x', friendlyName: 'X', dockerImage: 'x:1', raw: {} });
    prismaMock.image.update.mockResolvedValue({ id: 'img1' });
    prismaMock.registryEntry.update.mockResolvedValue({ id: 'mk1' });
    prismaMock.workspace.findFirst.mockResolvedValue({ id: 'ws1' });
    prismaMock.agent.findMany.mockResolvedValue([{ zone: { name: 'default' } }]);

    expect(await svc.reinstallImage('org1', 'u1', 'img1')).toEqual({ ok: true, imageId: 'img1', dockerImage: 'x:1' });
    expect(redis.publish).toHaveBeenCalledWith(
      'chista:zone:default:image',
      expect.objectContaining({ action: 'PULL', dockerImage: 'x:1' }),
    );
  });
});

describe('normalizeIndex', () => {
  it('parses a bare array and { items } / { workspaces } wrappers', () => {
    const item = { name: 'firefox', dockerImage: 'kasmweb/firefox:1.16.0' };
    expect(normalizeIndex([item])).toHaveLength(1);
    expect(normalizeIndex({ items: [item] })).toHaveLength(1);
    expect(normalizeIndex({ workspaces: [item] })).toHaveLength(1);
  });

  it('maps the LinuxServer.io fleet API into lscr.io images', () => {
    const body = {
      data: {
        repositories: {
          linuxserver: [
            { name: 'plex', description: 'Plex media server', category: 'Media,Downloaders', project_logo: 'https://logo/plex.png' },
            { name: 'old', deprecated: true },
          ],
        },
      },
    };
    const items = normalizeIndex(body);
    expect(items).toHaveLength(1); // deprecated dropped
    expect(items[0]).toMatchObject({
      name: 'plex',
      friendlyName: 'Plex',
      dockerImage: 'lscr.io/linuxserver/plex:latest',
      iconUrl: 'https://logo/plex.png',
      categories: ['Media', 'Downloaders'],
    });
  });

  it('returns [] for an unrecognised shape', () => {
    expect(normalizeIndex({ nope: true })).toEqual([]);
  });
});
