import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    workspace: { findFirst: vi.fn(), create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    image: { create: vi.fn() },
    server: { findFirst: vi.fn() },
    deploymentZone: { findFirst: vi.fn() },
    userGroup: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
    group: { findMany: vi.fn() },
    setting: { findUnique: vi.fn() },
  },
}));

vi.mock('@asha/db', () => ({ prisma: prismaMock }));

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

  it('binds a SERVER workspace to a server and defaults the zone to the server zone', async () => {
    prismaMock.workspace.findFirst.mockResolvedValue(null);
    prismaMock.server.findFirst.mockResolvedValue({ id: 'srv1', orgId: 'org1', zoneId: 'zone-eu' });
    prismaMock.workspace.create.mockImplementation(async (a: { data: Record<string, unknown> }) => ({ id: 'ws-srv', ...a.data }));

    await svc.create('org1', { ...base, name: 'win11', friendlyName: 'Windows 11', type: 'SERVER', serverId: 'srv1' } as never);

    expect(prismaMock.image.create).not.toHaveBeenCalled();
    const wsArg = prismaMock.workspace.create.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(wsArg.data.serverId).toBe('srv1');
    expect(wsArg.data.zoneId).toBe('zone-eu'); // inherited from the server
    expect(wsArg.data.type).toBe('SERVER');
  });

  it('rejects a SERVER workspace with no server selected', async () => {
    prismaMock.workspace.findFirst.mockResolvedValue(null);
    await expect(
      svc.create('org1', { ...base, name: 'win11', friendlyName: 'Windows 11', type: 'SERVER' } as never),
    ).rejects.toThrow(/server/i);
    expect(prismaMock.workspace.create).not.toHaveBeenCalled();
  });
});

const admin = { sub: 'admin1', orgId: 'org1', email: 'a@x', isSystemAdmin: true } as never;
const userA = { sub: 'userA', orgId: 'org1', email: 'u@x', isSystemAdmin: false } as never;

describe('WorkspacesService — access control', () => {
  let svc: WorkspacesService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new WorkspacesService();
    prismaMock.workspace.findMany.mockResolvedValue([]);
    prismaMock.workspace.findUnique.mockResolvedValue({ id: 'ws1' });
  });

  it('launchableForUser: a system admin sees ALL enabled workspaces (no access filter)', async () => {
    await svc.launchableForUser(admin);
    expect(prismaMock.userGroup.findMany).not.toHaveBeenCalled();
    expect(prismaMock.workspace.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { enabled: true } }),
    );
  });

  it('launchableForUser: deny-by-default (setting absent) → ONLY direct + group grants, NOT unassigned', async () => {
    prismaMock.setting.findUnique.mockResolvedValue(null); // absent ⇒ deny-by-default ON
    prismaMock.userGroup.findMany.mockResolvedValue([{ groupId: 'g1' }, { groupId: 'g2' }]);
    await svc.launchableForUser(userA);
    const arg = prismaMock.workspace.findMany.mock.calls[0]![0] as { where: { OR: unknown[] } };
    expect(arg.where.OR).toEqual([
      { assignedUsers: { some: { userId: 'userA' } } },
      { groups: { some: { id: { in: ['g1', 'g2'] } } } },
    ]);
    // The "unassigned ⇒ everyone" clause must be absent under deny-by-default.
    expect(arg.where.OR).not.toContainEqual({ groups: { none: {} }, assignedUsers: { none: {} } });
  });

  it('launchableForUser: legacy open mode (setting=false) → unassigned + direct + group grants', async () => {
    prismaMock.setting.findUnique.mockResolvedValue({ valueJson: false }); // explicit opt-out
    prismaMock.userGroup.findMany.mockResolvedValue([{ groupId: 'g1' }]);
    await svc.launchableForUser(userA);
    expect(prismaMock.workspace.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          enabled: true,
          OR: expect.arrayContaining([
            { groups: { none: {} }, assignedUsers: { none: {} } },
            { assignedUsers: { some: { userId: 'userA' } } },
            { groups: { some: { id: { in: ['g1'] } } } },
          ]),
        }),
      }),
    );
  });

  it('launchableForUser: deny-by-default, user in no groups → only their direct grants', async () => {
    prismaMock.setting.findUnique.mockResolvedValue(null);
    prismaMock.userGroup.findMany.mockResolvedValue([]);
    await svc.launchableForUser(userA);
    const arg = prismaMock.workspace.findMany.mock.calls[0]![0] as { where: { OR: unknown[] } };
    expect(arg.where.OR).toEqual([{ assignedUsers: { some: { userId: 'userA' } } }]);
  });

  it('setAssignments: replaces group + user grants, org-scoped', async () => {
    prismaMock.workspace.findFirst.mockResolvedValue({ id: 'ws1' });
    prismaMock.user.findMany.mockResolvedValue([{ id: 'userA' }]);
    prismaMock.group.findMany.mockResolvedValue([{ id: 'g1' }]);
    prismaMock.workspace.update.mockResolvedValue({});

    await svc.setAssignments('org1', 'ws1', { userIds: ['userA'], groupIds: ['g1'] });

    expect(prismaMock.workspace.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ws1' },
        data: expect.objectContaining({
          groups: { set: [{ id: 'g1' }] },
          assignedUsers: { deleteMany: {}, create: [{ orgId: 'org1', userId: 'userA' }] },
        }),
      }),
    );
  });

  it('setAssignments: empty arrays clear all grants (visible to everyone)', async () => {
    prismaMock.workspace.findFirst.mockResolvedValue({ id: 'ws1' });
    prismaMock.workspace.update.mockResolvedValue({});

    await svc.setAssignments('org1', 'ws1', { userIds: [], groupIds: [] });

    expect(prismaMock.user.findMany).not.toHaveBeenCalled();
    expect(prismaMock.workspace.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          groups: { set: [] },
          assignedUsers: { deleteMany: {}, create: [] },
        }),
      }),
    );
  });

  it('setAssignments: 404 when the workspace is not in the caller org', async () => {
    prismaMock.workspace.findFirst.mockResolvedValue(null);
    await expect(svc.setAssignments('org1', 'nope', { userIds: [], groupIds: [] })).rejects.toThrow(/not found/i);
  });
});
