import { Injectable } from '@nestjs/common';
import { prisma } from '@chista/db';

@Injectable()
export class RbacService {
  /** Effective permissions for a user = union of permissions across group roles. */
  async effectivePermissions(userId: string): Promise<Set<string>> {
    const memberships = await prisma.userGroup.findMany({
      where: { userId },
      select: { groupId: true },
    });
    const groupIds = memberships.map((m) => m.groupId);
    if (groupIds.length === 0) return new Set();

    const groupRoles = await prisma.groupRole.findMany({
      where: { groupId: { in: groupIds } },
      select: { roleId: true },
    });
    const roleIds = [...new Set(groupRoles.map((r) => r.roleId))];
    if (roleIds.length === 0) return new Set();

    const rolePerms = await prisma.rolePermission.findMany({
      where: { roleId: { in: roleIds } },
      include: { permission: { select: { key: true } } },
    });
    return new Set(rolePerms.map((rp) => rp.permission.key));
  }
}
