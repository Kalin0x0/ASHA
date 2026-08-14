import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    group: { findFirst: vi.fn(), create: vi.fn() },
    role: { findMany: vi.fn() },
    rolePermission: { findMany: vi.fn() },
    groupRole: { findMany: vi.fn() },
    user: { findFirst: vi.fn() },
    userGroup: { upsert: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock('@asha/db', () => ({ prisma: prismaMock }));

import { GroupsService } from './groups.service';

// The caller holds GROUP_MANAGE and nothing else — the "limited admin" shape.
const rbac = { effectivePermissions: vi.fn().mockResolvedValue(['GROUP_MANAGE']) };
const svc = new GroupsService(rbac as never);
const USER = { sub: 'u1', orgId: 'org1', email: 'u@x.io', isSystemAdmin: false } as never;

/** Run create() and surface ONLY a BadRequestException (the scope guard);
 *  the dup-name pre-check is satisfied (findFirst→null) so any BadRequest is the guard. */
async function createGuardOnly(roleIds: string[]) {
  try {
    await svc.create(USER, { name: 'g', roleIds } as never);
  } catch (e) {
    if (e instanceof BadRequestException) throw e;
  }
}

describe('GroupsService.assertRolesInScope — cross-tenant role-injection guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.group.findFirst.mockResolvedValue(null);
    prismaMock.group.create.mockResolvedValue({ id: 'g1' });
    prismaMock.$transaction.mockResolvedValue(undefined);
    rbac.effectivePermissions.mockResolvedValue(['GROUP_MANAGE']);
    prismaMock.rolePermission.findMany.mockResolvedValue([]); // role carries nothing by default
  });

  it('rejects a roleId that is neither an org role nor a system role', async () => {
    prismaMock.role.findMany.mockResolvedValue([]); // resolves fewer than requested
    await expect(createGuardOnly(['foreign-or-bogus-role'])).rejects.toThrow(BadRequestException);
    expect(prismaMock.role.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ OR: [{ orgId: 'org1' }, { orgId: null }] }),
      }),
    );
  });

  it('accepts roleIds that all resolve within {org ∪ system}', async () => {
    prismaMock.role.findMany.mockResolvedValue([{ id: 'r1' }]);
    await expect(createGuardOnly(['r1'])).resolves.toBeUndefined();
  });

  it('no-ops when no roles are supplied', async () => {
    await expect(createGuardOnly([])).resolves.toBeUndefined();
    expect(prismaMock.role.findMany).not.toHaveBeenCalled();
  });
});

describe('GroupsService — privilege escalation via group membership', () => {
  const SUPER_ADMIN_PERMS = [
    { permission: { key: 'ROLE_MANAGE' } },
    { permission: { key: 'USER_CREATE' } },
    { permission: { key: 'SETTINGS_MANAGE' } },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    rbac.effectivePermissions.mockResolvedValue(['GROUP_MANAGE']);
    prismaMock.group.findFirst.mockResolvedValue({ id: 'seed-group-admins', orgId: 'org1' });
    prismaMock.user.findFirst.mockResolvedValue({ id: 'u1', orgId: 'org1' });
    prismaMock.userGroup.upsert.mockResolvedValue({});
    prismaMock.role.findMany.mockResolvedValue([{ id: 'r-super' }]);
  });

  it('refuses to add anyone to a group whose roles exceed the caller’s own permissions', async () => {
    prismaMock.groupRole.findMany.mockResolvedValue([{ roleId: 'r-super' }]);
    prismaMock.rolePermission.findMany.mockResolvedValue(SUPER_ADMIN_PERMS);
    // The headline exploit: GROUP_MANAGE-only caller adds THEMSELVES to Administrators.
    await expect(svc.addMember(USER, 'seed-group-admins', 'u1')).rejects.toThrow(/Cannot grant/);
    expect(prismaMock.userGroup.upsert).not.toHaveBeenCalled();
  });

  it('refuses for a confederate account too, not just self-add', async () => {
    prismaMock.groupRole.findMany.mockResolvedValue([{ roleId: 'r-super' }]);
    prismaMock.rolePermission.findMany.mockResolvedValue(SUPER_ADMIN_PERMS);
    prismaMock.user.findFirst.mockResolvedValue({ id: 'accomplice', orgId: 'org1' });
    await expect(svc.addMember(USER, 'seed-group-admins', 'accomplice')).rejects.toThrow(/Cannot grant/);
  });

  it('allows adding to a group whose permissions the caller already holds', async () => {
    prismaMock.groupRole.findMany.mockResolvedValue([{ roleId: 'r-peer' }]);
    prismaMock.rolePermission.findMany.mockResolvedValue([{ permission: { key: 'GROUP_MANAGE' } }]);
    await expect(svc.addMember(USER, 'g-peer', 'u1')).resolves.toEqual({ ok: true });
  });

  it('allows adding to a group that carries no roles at all', async () => {
    prismaMock.groupRole.findMany.mockResolvedValue([]);
    await expect(svc.addMember(USER, 'g-plain', 'u1')).resolves.toEqual({ ok: true });
    expect(prismaMock.rolePermission.findMany).not.toHaveBeenCalled();
  });

  it('never blocks a system admin', async () => {
    const ADMIN = { sub: 'a1', orgId: 'org1', isSystemAdmin: true } as never;
    prismaMock.groupRole.findMany.mockResolvedValue([{ roleId: 'r-super' }]);
    prismaMock.rolePermission.findMany.mockResolvedValue(SUPER_ADMIN_PERMS);
    await expect(svc.addMember(ADMIN, 'seed-group-admins', 'u1')).resolves.toEqual({ ok: true });
  });

  it('lets a wildcard holder confer anything', async () => {
    rbac.effectivePermissions.mockResolvedValue(['*']);
    prismaMock.groupRole.findMany.mockResolvedValue([{ roleId: 'r-super' }]);
    prismaMock.rolePermission.findMany.mockResolvedValue(SUPER_ADMIN_PERMS);
    await expect(svc.addMember(USER, 'seed-group-admins', 'u1')).resolves.toEqual({ ok: true });
  });

  it('closes the same hole on create: cannot mint a group carrying roles above you', async () => {
    prismaMock.group.findFirst.mockResolvedValue(null); // name is free
    prismaMock.rolePermission.findMany.mockResolvedValue(SUPER_ADMIN_PERMS);
    await expect(svc.create(USER, { name: 'backdoor', roleIds: ['r-super'] } as never)).rejects.toThrow(
      /Cannot grant/,
    );
    expect(prismaMock.group.create).not.toHaveBeenCalled();
  });
});
