import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from '@chista/db';
import type { AuthUser } from '../../common/decorators';

export interface GroupInput {
  name: string;
  description?: string | null;
  priority?: number;
  keepaliveExpirationSec?: number | null;
  idleDisconnectSec?: number | null;
  usageLimitSec?: number | null;
  maxConcurrentSessions?: number | null;
  roleIds?: string[];
}

type GroupRow = {
  id: string;
  name: string;
  description: string | null;
  priority: number;
  isDefault: boolean;
  keepaliveExpirationSec: number | null;
  idleDisconnectSec: number | null;
  usageLimitSec: number | null;
  maxConcurrentSessions: number | null;
  _count: { members: number };
  roles: { role: { id: string; name: string } }[];
};

const GROUP_INCLUDE = {
  _count: { select: { members: true } },
  roles: { select: { role: { select: { id: true, name: true } } } },
} as const;

/** Group is tenant-auto-scoped (orgId injected by the Prisma extension). */
@Injectable()
export class GroupsService {
  async list() {
    const groups = await prisma.group.findMany({
      orderBy: [{ priority: 'asc' }, { name: 'asc' }],
      include: GROUP_INCLUDE,
    });
    return groups.map((g) => this.shape(g));
  }

  async get(id: string) {
    const g = await prisma.group.findFirst({
      where: { id },
      include: {
        ...GROUP_INCLUDE,
        members: { select: { user: { select: { id: true, email: true, displayName: true } } } },
      },
    });
    if (!g) throw new NotFoundException('Group not found');
    return { ...this.shape(g), members: g.members.map((m) => m.user) };
  }

  async create(user: AuthUser, dto: GroupInput) {
    const exists = await prisma.group.findFirst({ where: { name: dto.name } });
    if (exists) throw new BadRequestException('A group with this name already exists');
    await this.assertRolesInScope(user.orgId, dto.roleIds ?? []);
    const roleIds = [...new Set(dto.roleIds ?? [])];
    const group = await prisma.group.create({
      data: {
        orgId: user.orgId,
        name: dto.name,
        description: dto.description ?? null,
        priority: dto.priority ?? 100,
        keepaliveExpirationSec: dto.keepaliveExpirationSec ?? null,
        idleDisconnectSec: dto.idleDisconnectSec ?? null,
        usageLimitSec: dto.usageLimitSec ?? null,
        maxConcurrentSessions: dto.maxConcurrentSessions ?? null,
        ...(roleIds.length ? { roles: { create: roleIds.map((roleId) => ({ roleId })) } } : {}),
      },
    });
    return this.get(group.id);
  }

  async update(user: AuthUser, id: string, dto: Partial<GroupInput>) {
    const g = await prisma.group.findFirst({ where: { id } });
    if (!g) throw new NotFoundException('Group not found');
    if (dto.roleIds !== undefined) await this.assertRolesInScope(user.orgId, dto.roleIds);
    await prisma.$transaction(async (tx) => {
      await tx.group.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.description !== undefined ? { description: dto.description } : {}),
          ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
          ...(dto.keepaliveExpirationSec !== undefined ? { keepaliveExpirationSec: dto.keepaliveExpirationSec } : {}),
          ...(dto.idleDisconnectSec !== undefined ? { idleDisconnectSec: dto.idleDisconnectSec } : {}),
          ...(dto.usageLimitSec !== undefined ? { usageLimitSec: dto.usageLimitSec } : {}),
          ...(dto.maxConcurrentSessions !== undefined ? { maxConcurrentSessions: dto.maxConcurrentSessions } : {}),
        },
      });
      if (dto.roleIds !== undefined) {
        await tx.groupRole.deleteMany({ where: { groupId: id } });
        const roleIds = [...new Set(dto.roleIds)];
        if (roleIds.length) {
          await tx.groupRole.createMany({ data: roleIds.map((roleId) => ({ groupId: id, roleId })) });
        }
      }
    });
    return this.get(id);
  }

  async remove(id: string) {
    const g = await prisma.group.findFirst({ where: { id } });
    if (!g) throw new NotFoundException('Group not found');
    if (g.isDefault) throw new BadRequestException('The default group cannot be deleted');
    await prisma.group.delete({ where: { id } });
    return { ok: true };
  }

  async addMember(user: AuthUser, id: string, userId: string) {
    const g = await prisma.group.findFirst({ where: { id } }); // org-scoped → confirms group in org
    if (!g) throw new NotFoundException('Group not found');
    const member = await prisma.user.findFirst({ where: { id: userId } }); // org-scoped → confirms user in org
    if (!member) throw new NotFoundException('User not found');
    await prisma.userGroup.upsert({
      where: { userId_groupId: { userId, groupId: id } },
      create: { orgId: user.orgId, userId, groupId: id },
      update: {},
    });
    return { ok: true };
  }

  async removeMember(id: string, userId: string) {
    const g = await prisma.group.findFirst({ where: { id } }); // org-scoped guard
    if (!g) throw new NotFoundException('Group not found');
    await prisma.userGroup.deleteMany({ where: { groupId: id, userId } });
    return { ok: true };
  }

  /**
   * Reject role ids that are neither the caller's org roles nor built-in system
   * roles (orgId=null). GroupRole/Role are NOT tenant-auto-scoped, so without
   * this an org admin could couple a group to another tenant's role.
   */
  private async assertRolesInScope(orgId: string, roleIds: string[]) {
    const ids = [...new Set(roleIds)];
    if (!ids.length) return;
    const ok = await prisma.role.findMany({
      where: { id: { in: ids }, OR: [{ orgId }, { orgId: null }] },
      select: { id: true },
    });
    if (ok.length !== ids.length) throw new BadRequestException('Unknown or unauthorized role');
  }

  private shape(g: GroupRow) {
    return {
      id: g.id,
      name: g.name,
      description: g.description,
      priority: g.priority,
      isDefault: g.isDefault,
      memberCount: g._count.members,
      keepaliveExpirationSec: g.keepaliveExpirationSec,
      idleDisconnectSec: g.idleDisconnectSec,
      usageLimitSec: g.usageLimitSec,
      maxConcurrentSessions: g.maxConcurrentSessions,
      roles: g.roles.map((r) => r.role),
    };
  }
}
