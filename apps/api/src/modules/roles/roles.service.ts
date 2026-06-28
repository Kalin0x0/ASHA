import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from '@asha/db';
import { PERMISSION_CATALOG, PERMISSION_KEYS } from '@asha/rbac';
import type { AuthUser } from '../../common/decorators';
import { RbacService } from '../../common/rbac.service';

export interface RoleInput {
  name: string;
  description?: string | null;
  permissions?: string[];
}

type RoleRow = {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  orgId: string | null;
  permissions: { permission: { key: string } }[];
  _count: { groups: number };
};

const ROLE_INCLUDE = {
  permissions: { select: { permission: { select: { key: true } } } },
  _count: { select: { groups: true } },
} as const;

/**
 * Roles are NOT tenant-auto-scoped (built-in system roles carry orgId=null), so
 * every query scopes to `{ org's rows } ∪ { system rows }` at the service layer.
 */
@Injectable()
export class RolesService {
  constructor(private readonly rbac: RbacService) {}

  catalog() {
    return PERMISSION_CATALOG;
  }

  async list(user: AuthUser) {
    const roles = await prisma.role.findMany({
      where: { OR: [{ orgId: user.orgId }, { orgId: null }] },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
      include: ROLE_INCLUDE,
    });
    return roles.map((r) => this.shape(r));
  }

  async get(user: AuthUser, id: string) {
    const r = await prisma.role.findFirst({
      where: { id, OR: [{ orgId: user.orgId }, { orgId: null }] },
      include: ROLE_INCLUDE,
    });
    if (!r) throw new NotFoundException('Role not found');
    return this.shape(r);
  }

  async create(user: AuthUser, dto: RoleInput) {
    const exists = await prisma.role.findFirst({ where: { orgId: user.orgId, name: dto.name } });
    if (exists) throw new BadRequestException('A role with this name already exists');
    await this.assertCanGrant(user, dto.permissions);
    const permissionIds = await this.permissionIds(dto.permissions ?? []);
    const role = await prisma.role.create({
      data: {
        orgId: user.orgId,
        name: dto.name,
        description: dto.description ?? null,
        isSystem: false,
        permissions: { create: permissionIds.map((permissionId) => ({ permissionId })) },
      },
    });
    return this.get(user, role.id);
  }

  async update(user: AuthUser, id: string, dto: Partial<RoleInput>) {
    const role = await this.requireEditable(user, id);
    await this.assertCanGrant(user, dto.permissions);
    await prisma.$transaction(async (tx) => {
      await tx.role.update({
        where: { id: role.id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.description !== undefined ? { description: dto.description } : {}),
        },
      });
      if (dto.permissions !== undefined) {
        const permissionIds = await this.permissionIds(dto.permissions);
        await tx.rolePermission.deleteMany({ where: { roleId: id } });
        if (permissionIds.length) {
          await tx.rolePermission.createMany({
            data: permissionIds.map((permissionId) => ({ roleId: id, permissionId })),
          });
        }
      }
    });
    return this.get(user, id);
  }

  async remove(user: AuthUser, id: string) {
    await this.requireEditable(user, id);
    await prisma.role.delete({ where: { id } });
    return { ok: true };
  }

  /** Load a role the caller owns; reject system/built-in or cross-org roles. */
  private async requireEditable(user: AuthUser, id: string) {
    const role = await prisma.role.findFirst({ where: { id } });
    if (!role || role.orgId !== user.orgId) throw new NotFoundException('Role not found');
    if (role.isSystem) throw new BadRequestException('Built-in roles cannot be modified');
    return role;
  }

  /**
   * Prevent privilege escalation: a non-system-admin may only grant permissions
   * they themselves hold (a '*' super-permission grants all).
   */
  private async assertCanGrant(user: AuthUser, permissions?: string[]) {
    if (user.isSystemAdmin || !permissions?.length) return;
    const granted = new Set(await this.rbac.effectivePermissions(user.sub));
    if (granted.has('*')) return;
    const over = permissions.filter((k) => !granted.has(k));
    if (over.length) {
      throw new ForbiddenException(`Cannot grant permissions you do not hold: ${over.join(', ')}`);
    }
  }

  private async permissionIds(keys: string[]): Promise<string[]> {
    const valid = keys.filter((k) => PERMISSION_KEYS.includes(k));
    if (valid.length === 0) return [];
    const perms = await prisma.permission.findMany({ where: { key: { in: valid } }, select: { id: true } });
    return perms.map((p) => p.id);
  }

  private shape(r: RoleRow) {
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      builtIn: r.orgId === null,
      groupCount: r._count.groups,
      permissions: r.permissions.map((p) => p.permission.key),
    };
  }
}
