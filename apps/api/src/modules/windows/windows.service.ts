import { Injectable, NotFoundException } from '@nestjs/common';
import type { CreateRemoteAppDto } from '@chista/contracts';
import { prisma } from '@chista/db';
import { AuditService } from '../../common/audit.service';

/**
 * Windows / RDS: manage RemoteApp entries published from RDS farms or
 * standalone Windows servers. Apps are scoped to a Workspace; callers must
 * hold `WORKSPACE_MANAGE` permission. The workspace itself is already
 * org-scoped so all queries here join through it.
 */
@Injectable()
export class WindowsService {
  constructor(private readonly audit: AuditService) {}

  listRemoteApps(orgId: string, workspaceId: string) {
    return prisma.remoteApp.findMany({
      where: { workspaceId, workspace: { orgId } },
      orderBy: { name: 'asc' },
    });
  }

  async createRemoteApp(orgId: string, actorUserId: string, dto: CreateRemoteAppDto) {
    const workspace = await prisma.workspace.findFirst({ where: { id: dto.workspaceId, orgId } });
    if (!workspace) throw new NotFoundException('Workspace not found');

    const created = await prisma.remoteApp.create({
      data: { workspaceId: dto.workspaceId, name: dto.name, path: dto.path, args: dto.args },
    });
    await this.audit.record({
      orgId,
      actorUserId,
      action: 'remoteapp.create',
      targetType: 'RemoteApp',
      targetId: created.id,
      metadata: { workspaceId: dto.workspaceId },
    });
    return created;
  }

  async updateRemoteApp(
    orgId: string,
    actorUserId: string,
    workspaceId: string,
    id: string,
    dto: Partial<Pick<CreateRemoteAppDto, 'name' | 'path' | 'args'>>,
  ) {
    const existing = await prisma.remoteApp.findFirst({
      where: { id, workspaceId, workspace: { orgId } },
    });
    if (!existing) throw new NotFoundException('RemoteApp not found');

    const updated = await prisma.remoteApp.update({
      where: { id },
      data: { name: dto.name, path: dto.path, args: dto.args },
    });
    await this.audit.record({ orgId, actorUserId, action: 'remoteapp.update', targetType: 'RemoteApp', targetId: id });
    return updated;
  }

  async removeRemoteApp(orgId: string, actorUserId: string, workspaceId: string, id: string) {
    const existing = await prisma.remoteApp.findFirst({
      where: { id, workspaceId, workspace: { orgId } },
    });
    if (!existing) throw new NotFoundException('RemoteApp not found');

    await prisma.remoteApp.delete({ where: { id } });
    await this.audit.record({ orgId, actorUserId, action: 'remoteapp.delete', targetType: 'RemoteApp', targetId: id });
    return { ok: true };
  }
}
