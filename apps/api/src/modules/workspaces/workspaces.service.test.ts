import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    workspace: { findFirst: vi.fn(), create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
    image: { create: vi.fn() },
    server: { findFirst: vi.fn() },
    deploymentZone: { findFirst: vi.fn() },
    userGroup: { findMany: vi.fn() },
    user: { findMany: vi.fn(), findFirst: vi.fn() },
    group: { findMany: vi.fn(), findFirst: vi.fn() },
    setting: { findUnique: vi.fn() },
    session: { findMany: vi.fn().mockResolvedValue([]), deleteMany: vi.fn() },
    workspaceUser: { createMany: vi.fn(), deleteMany: vi.fn() },
  },
}));

vi.mock('@asha/db', () => ({ prisma: prismaMock }));

import { WorkspacesService } from './workspaces.service';

const base = { type: 'CONTAINER', categories: [] as string[], gpuCount: 0, dockerConfig: {} };

describe('WorkspacesService.create', () => {
  let svc: WorkspacesService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new WorkspacesService({ destroy: vi.fn().mockResolvedValue(true) } as never);
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
    svc = new WorkspacesService({ destroy: vi.fn().mockResolvedValue(true) } as never);
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

  // ── Single-subject access ────────────────────────────────────────────────
  // These exist so a UI can flip one row. The property that matters is that
  // they touch ONLY the named pair: a screen that had to resend the whole
  // roster would revoke everyone whose grant it had not loaded yet.

  it('setUserAccess: grants without disturbing the rest of the roster', async () => {
    prismaMock.workspace.findFirst.mockResolvedValue({ id: 'ws1' });
    prismaMock.user.findFirst.mockResolvedValue({ id: 'userA' });
    prismaMock.workspace.findUnique.mockResolvedValue({ id: 'ws1' });

    await svc.setUserAccess('org1', 'ws1', 'userA', true);

    expect(prismaMock.workspaceUser.createMany).toHaveBeenCalledWith({
      data: [{ orgId: 'org1', workspaceId: 'ws1', userId: 'userA' }],
      skipDuplicates: true,
    });
    // Nothing else may be rewritten — no deleteMany, no `set` on the roster.
    expect(prismaMock.workspaceUser.deleteMany).not.toHaveBeenCalled();
    expect(prismaMock.workspace.update).not.toHaveBeenCalled();
  });

  it('setUserAccess: re-granting is a no-op, not a unique-constraint error', async () => {
    prismaMock.workspace.findFirst.mockResolvedValue({ id: 'ws1' });
    prismaMock.user.findFirst.mockResolvedValue({ id: 'userA' });
    prismaMock.workspace.findUnique.mockResolvedValue({ id: 'ws1' });

    await svc.setUserAccess('org1', 'ws1', 'userA', true);

    // A double-click must not become a 500.
    const arg = prismaMock.workspaceUser.createMany.mock.calls[0]![0] as { skipDuplicates: boolean };
    expect(arg.skipDuplicates).toBe(true);
  });

  it('setUserAccess: revokes only the named pair', async () => {
    prismaMock.workspace.findFirst.mockResolvedValue({ id: 'ws1' });
    prismaMock.user.findFirst.mockResolvedValue({ id: 'userA' });
    prismaMock.workspace.findUnique.mockResolvedValue({ id: 'ws1' });

    await svc.setUserAccess('org1', 'ws1', 'userA', false);

    expect(prismaMock.workspaceUser.deleteMany).toHaveBeenCalledWith({
      where: { workspaceId: 'ws1', userId: 'userA' },
    });
    expect(prismaMock.workspaceUser.createMany).not.toHaveBeenCalled();
  });

  it('setUserAccess: refuses a user from another tenant', async () => {
    prismaMock.workspace.findFirst.mockResolvedValue({ id: 'ws1' });
    prismaMock.user.findFirst.mockResolvedValue(null); // scoped query found nothing

    await expect(svc.setUserAccess('org1', 'ws1', 'outsider', true)).rejects.toThrow(/user not found/i);
    // The lookup itself must carry the org, or an id from another tenant would
    // be found and granted — the mock returns null whatever it is asked.
    expect(prismaMock.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'outsider', orgId: 'org1' } }),
    );
    expect(prismaMock.workspaceUser.createMany).not.toHaveBeenCalled();
  });

  it('setUserAccess: refuses a workspace from another tenant', async () => {
    prismaMock.workspace.findFirst.mockResolvedValue(null);

    await expect(svc.setUserAccess('org1', 'other-org-ws', 'userA', true)).rejects.toThrow(/workspace not found/i);
    expect(prismaMock.workspace.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'other-org-ws', orgId: 'org1' } }),
    );
    // Bail before touching anything else.
    expect(prismaMock.user.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.workspaceUser.createMany).not.toHaveBeenCalled();
  });

  it('setGroupAccess: connects and disconnects one group, leaving the others', async () => {
    prismaMock.workspace.findFirst.mockResolvedValue({ id: 'ws1' });
    prismaMock.group.findFirst.mockResolvedValue({ id: 'g1' });
    prismaMock.workspace.update.mockResolvedValue({});
    prismaMock.workspace.findUnique.mockResolvedValue({ id: 'ws1' });

    await svc.setGroupAccess('org1', 'ws1', 'g1', true);
    expect(prismaMock.workspace.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { groups: { connect: { id: 'g1' } } } }),
    );

    await svc.setGroupAccess('org1', 'ws1', 'g1', false);
    expect(prismaMock.workspace.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: { groups: { disconnect: { id: 'g1' } } } }),
    );
    // `set` would replace the whole list — the very thing these avoid.
    for (const call of prismaMock.workspace.update.mock.calls) {
      const data = (call[0] as { data: { groups: Record<string, unknown> } }).data;
      expect(data.groups).not.toHaveProperty('set');
    }
  });

  it('setGroupAccess: refuses a group from another tenant', async () => {
    prismaMock.workspace.findFirst.mockResolvedValue({ id: 'ws1' });
    prismaMock.group.findFirst.mockResolvedValue(null);

    await expect(svc.setGroupAccess('org1', 'ws1', 'outsider', true)).rejects.toThrow(/group not found/i);
    expect(prismaMock.group.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'outsider', orgId: 'org1' } }),
    );
    expect(prismaMock.workspace.update).not.toHaveBeenCalled();
  });
});

describe('WorkspacesService.remove', () => {
  let svc: WorkspacesService;
  let destroy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    destroy = vi.fn().mockResolvedValue(true);
    svc = new WorkspacesService({ destroy } as never);
  });

  it('drains live sessions (incl. the staging pool) before deleting the workspace', async () => {
    prismaMock.workspace.findFirst.mockResolvedValue({ id: 'ws1' });
    prismaMock.session.findMany.mockResolvedValue([
      { id: 'user-sess', orgId: 'org1', zoneId: 'z1', containerId: 'c1', kasmId: 'k1', agentId: 'a1' },
      { id: 'pool-sess', orgId: 'org1', zoneId: 'z1', containerId: 'c2', kasmId: 'k2', agentId: 'a1' },
    ]);
    prismaMock.workspace.deleteMany.mockResolvedValue({ count: 1 });

    await svc.remove('org1', 'ws1');

    expect(destroy).toHaveBeenCalledWith(expect.objectContaining({ id: 'user-sess' }), 'workspace_deleted');
    expect(destroy).toHaveBeenCalledWith(expect.objectContaining({ id: 'pool-sess' }), 'workspace_deleted');
    expect(prismaMock.session.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: 'ws1',
          status: { notIn: ['DESTROYED', 'TERMINATING', 'ERROR'] },
        }),
      }),
    );
    expect(prismaMock.workspace.deleteMany).toHaveBeenCalledWith({ where: { id: 'ws1', orgId: 'org1' } });
  });

  it('404 when the workspace is not in the caller org (no drain, no delete)', async () => {
    prismaMock.workspace.findFirst.mockResolvedValue(null);
    await expect(svc.remove('org1', 'foreign')).rejects.toThrow(/not found/i);
    expect(destroy).not.toHaveBeenCalled();
    expect(prismaMock.workspace.deleteMany).not.toHaveBeenCalled();
  });
});

/**
 * `GET /workspaces` is guarded by WORKSPACE_VIEW, which the seeded `User` role
 * (and every 10-minute demo account) holds. Gating the catalog on that
 * permission alone therefore handed the FULL workspace list — plus the
 * per-workspace roster of who is assigned to it — to anyone who could log in.
 * The filtering has to happen in the service, keyed on an admin-side
 * permission, and it must fail CLOSED when RBAC is unavailable.
 */
describe('WorkspacesService.list — catalog disclosure', () => {
  const ADMIN = { sub: 'u-admin', orgId: 'org1', email: 'a@x', isSystemAdmin: true } as never;
  const PLAIN = { sub: 'u-plain', orgId: 'org1', email: 'p@x', isSystemAdmin: false } as never;

  const ALL = [
    { id: 'ws-public', friendlyName: 'Public', groups: [], assignedUsers: [] },
    { id: 'ws-finance', friendlyName: 'Finance', groups: [{ id: 'g-fin', name: 'Finance' }], assignedUsers: [{ userId: 'u-cfo' }] },
  ];
  const GRANTED = [ALL[0]];

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.session.findMany.mockResolvedValue([]);
    prismaMock.userGroup.findMany.mockResolvedValue([]);
    prismaMock.setting.findUnique.mockResolvedValue(null); // deny-by-default ON
  });

  const make = (perms: string[] | null) =>
    new WorkspacesService(
      { destroy: vi.fn() } as never,
      perms === null ? undefined : ({ effectivePermissions: async () => new Set(perms) } as never),
    );

  it('a system admin sees the whole catalog including the assignment roster', async () => {
    prismaMock.workspace.findMany.mockResolvedValue(ALL);

    const res = (await make([]).list(ADMIN)) as unknown as Record<string, unknown>[];

    expect(res).toHaveLength(2);
    expect(res[1]).toHaveProperty('assignedUsers');
  });

  it('an Operator (SESSION_VIEW_ANY, no WORKSPACE_EDIT) still sees the whole catalog', async () => {
    // Regression guard: tightening the route to WORKSPACE_EDIT would have
    // broken the admin sessions screen, which Operators legitimately use.
    prismaMock.workspace.findMany.mockResolvedValue(ALL);

    const res = (await make(['WORKSPACE_VIEW', 'SESSION_VIEW_ANY']).list(ADMIN_LIKE_OPERATOR)) as unknown as Record<string, unknown>[];

    expect(res).toHaveLength(2);
  });

  it('a plain user gets ONLY their granted workspaces, with the roster stripped', async () => {
    prismaMock.workspace.findMany.mockResolvedValue(GRANTED);

    const res = (await make(['WORKSPACE_VIEW']).list(PLAIN)) as Record<string, unknown>[];

    expect(res).toHaveLength(1);
    expect(res[0]!.id).toBe('ws-public');
    // Who else may use a workspace is admin information.
    expect(res[0]).not.toHaveProperty('assignedUsers');
    expect(res[0]).not.toHaveProperty('groups');
    // It must have gone through the access filter, not the unfiltered catalog.
    expect(prismaMock.workspace.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ enabled: true }) }),
    );
  });

  it('fails closed: with RBAC unavailable a non-admin is NOT treated as admin', async () => {
    prismaMock.workspace.findMany.mockResolvedValue(GRANTED);

    const res = (await make(null).list(PLAIN)) as Record<string, unknown>[];

    expect(res).toHaveLength(1);
    expect(res[0]).not.toHaveProperty('assignedUsers');
  });
});

const ADMIN_LIKE_OPERATOR = { sub: 'u-op', orgId: 'org1', email: 'o@x', isSystemAdmin: false } as never;
