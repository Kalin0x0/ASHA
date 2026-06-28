import 'reflect-metadata';
import { ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    role: { findFirst: vi.fn() },
    permission: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock('@asha/db', () => ({ prisma: prismaMock }));
vi.mock('@asha/rbac', () => ({
  PERMISSION_CATALOG: [],
  PERMISSION_KEYS: new Set(['USER_DELETE', 'SESSION_VIEW', 'ROLE_MANAGE']),
}));

import { RolesService } from './roles.service';

const rbac = { effectivePermissions: vi.fn() };
const svc = new RolesService(rbac as never);

const NON_ADMIN = { sub: 'u1', orgId: 'org1', email: 'u@x.io', isSystemAdmin: false } as never;
const ADMIN = { sub: 'a1', orgId: 'org1', email: 'a@x.io', isSystemAdmin: true } as never;

/** Run create() and surface ONLY a ForbiddenException (the guard under test);
 *  any other downstream error from the unmocked create body is irrelevant here. */
async function createGuardOnly(user: never, permissions: string[]) {
  try {
    await svc.create(user, { name: 'r', permissions } as never);
  } catch (e) {
    if (e instanceof ForbiddenException) throw e;
  }
}

describe('RolesService.assertCanGrant — privilege-escalation guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.role.findFirst.mockResolvedValue(null);
    prismaMock.permission.findMany.mockResolvedValue([]);
    prismaMock.$transaction.mockResolvedValue({ id: 'r1' });
  });

  it('blocks a non-admin from granting a permission they do not hold', async () => {
    rbac.effectivePermissions.mockResolvedValue(new Set(['ROLE_MANAGE']));
    await expect(createGuardOnly(NON_ADMIN, ['USER_DELETE'])).rejects.toThrow(ForbiddenException);
  });

  it('lets a non-admin grant only permissions they themselves hold', async () => {
    rbac.effectivePermissions.mockResolvedValue(new Set(['ROLE_MANAGE', 'SESSION_VIEW']));
    await expect(createGuardOnly(NON_ADMIN, ['SESSION_VIEW'])).resolves.toBeUndefined();
    expect(rbac.effectivePermissions).toHaveBeenCalledWith('u1');
  });

  it('skips the check entirely for a system admin', async () => {
    await expect(createGuardOnly(ADMIN, ['USER_DELETE'])).resolves.toBeUndefined();
    expect(rbac.effectivePermissions).not.toHaveBeenCalled();
  });
});
