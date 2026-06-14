import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    workspace: { findFirst: vi.fn(), create: vi.fn() },
    image: { create: vi.fn() },
  },
}));

vi.mock('@chista/db', () => ({ prisma: prismaMock }));

import { WorkspacesService } from './workspaces.service';

const base = { type: 'CONTAINER', categories: [] as string[], gpuCount: 0, dockerConfig: {} };

describe('WorkspacesService.create', () => {
  let svc: WorkspacesService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new WorkspacesService();
  });

  it('auto-creates and links a backing image when a dockerImage is supplied', async () => {
    prismaMock.workspace.findFirst.mockResolvedValue(null);
    prismaMock.image.create.mockResolvedValue({ id: 'img-new' });
    prismaMock.workspace.create.mockImplementation(async (a: { data: Record<string, unknown> }) => ({ id: 'ws-new', ...a.data }));

    await svc.create('org1', {
      ...base,
      name: 'brave',
      friendlyName: 'Brave',
      dockerImage: 'kasmweb/brave:1.16.0',
      categories: ['Browsers'],
    } as never);

    expect(prismaMock.image.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ dockerImage: 'kasmweb/brave:1.16.0', orgId: 'org1' }),
      }),
    );
    const wsArg = prismaMock.workspace.create.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(wsArg.data.imageId).toBe('img-new');
    expect(wsArg.data.enabled).toBe(true);
  });

  it('does not create an image when an explicit imageId is provided', async () => {
    prismaMock.workspace.findFirst.mockResolvedValue(null);
    prismaMock.workspace.create.mockResolvedValue({ id: 'ws2' });

    await svc.create('org1', { ...base, name: 'x', friendlyName: 'X', imageId: 'img-existing' } as never);

    expect(prismaMock.image.create).not.toHaveBeenCalled();
    const wsArg = prismaMock.workspace.create.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(wsArg.data.imageId).toBe('img-existing');
  });

  it('rejects a duplicate workspace name before creating anything', async () => {
    prismaMock.workspace.findFirst.mockResolvedValue({ id: 'existing' });

    await expect(
      svc.create('org1', { ...base, name: 'firefox', friendlyName: 'Firefox', dockerImage: 'x:1' } as never),
    ).rejects.toThrow(/already exists/i);

    expect(prismaMock.image.create).not.toHaveBeenCalled();
    expect(prismaMock.workspace.create).not.toHaveBeenCalled();
  });
});
