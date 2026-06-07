import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    group: { findFirst: vi.fn(), create: vi.fn() },
    role: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock('@chista/db', () => ({ prisma: prismaMock }));

import { GroupsService } from './groups.service';

const svc = new GroupsService();
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
