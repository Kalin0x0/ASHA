import { Injectable, NotFoundException } from '@nestjs/common';
import type { CreateStagingDto, UpdateStagingDto } from '@chista/contracts';
import { prisma } from '@chista/db';
import { AuditService } from '../../common/audit.service';

/**
 * Session staging: pre-warmed pools of ready sessions per (workspace, zone) so
 * end-users connect instantly instead of waiting for a cold provision. The
 * desired count is advisory — the scheduler reconciles actual standby sessions
 * toward `desiredSessions`.
 */
@Injectable()
export class StagingService {
  constructor(private readonly audit: AuditService) {}

  list(orgId: string) {
    return prisma.sessionStaging.findMany({
      where: { orgId },
      orderBy: { createdAt: 'desc' },
      include: { workspace: { select: { id: true, name: true, friendlyName: true } } },
    });
  }

  async create(orgId: string, actorUserId: string, dto: CreateStagingDto) {
    // Confirm the workspace + zone belong to this org before staging them.
    const [ws, zone] = await Promise.all([
      prisma.workspace.findFirst({ where: { id: dto.workspaceId, orgId } }),
      prisma.deploymentZone.findFirst({ where: { id: dto.zoneId, orgId } }),
    ]);
    if (!ws) throw new NotFoundException('Workspace not found');
    if (!zone) throw new NotFoundException('Zone not found');

    const created = await prisma.sessionStaging.create({
      data: {
        orgId,
        workspaceId: dto.workspaceId,
        zoneId: dto.zoneId,
        desiredSessions: dto.desiredSessions,
        enabled: dto.enabled,
      },
    });
    await this.audit.record({
      orgId,
      actorUserId,
      action: 'staging.create',
      targetType: 'SessionStaging',
      targetId: created.id,
    });
    return created;
  }

  async update(orgId: string, actorUserId: string, id: string, dto: UpdateStagingDto) {
    const res = await prisma.sessionStaging.updateMany({
      where: { id, orgId },
      data: { desiredSessions: dto.desiredSessions, enabled: dto.enabled },
    });
    if (res.count === 0) throw new NotFoundException('Staging rule not found');
    await this.audit.record({
      orgId,
      actorUserId,
      action: 'staging.update',
      targetType: 'SessionStaging',
      targetId: id,
    });
    return prisma.sessionStaging.findFirst({ where: { id, orgId } });
  }

  async remove(orgId: string, actorUserId: string, id: string) {
    const res = await prisma.sessionStaging.deleteMany({ where: { id, orgId } });
    if (res.count === 0) throw new NotFoundException('Staging rule not found');
    await this.audit.record({
      orgId,
      actorUserId,
      action: 'staging.delete',
      targetType: 'SessionStaging',
      targetId: id,
    });
    return { ok: true };
  }
}
