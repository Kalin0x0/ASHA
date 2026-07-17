import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { CreateStagingDto, UpdateStagingDto } from '@asha/contracts';
import { prisma } from '@asha/db';
import { AuditService } from '../../common/audit.service';
import { SessionsService } from '../sessions/sessions.service';

/**
 * Session staging: pre-warmed pools of ready sessions per (workspace, zone) so
 * end-users connect instantly instead of waiting for a cold provision. The
 * StagingReconcilerService reconciles the actual standby pool toward
 * `desiredSessions`.
 */
@Injectable()
export class StagingService {
  constructor(
    private readonly audit: AuditService,
    private readonly sessions: SessionsService,
  ) {}

  /**
   * Rules enriched with the pool's ACTUAL fill level so the UI reports reality,
   * not the target: readyCount = unclaimed RUNNING (instantly claimable),
   * warmingCount = unclaimed still provisioning.
   */
  async list(orgId: string) {
    const rules = await prisma.sessionStaging.findMany({
      where: { orgId },
      orderBy: { createdAt: 'desc' },
      include: { workspace: { select: { id: true, name: true, friendlyName: true } } },
    });
    if (rules.length === 0) return rules;
    const counts = await prisma.session.groupBy({
      by: ['stagingId', 'status'],
      where: {
        stagingId: { in: rules.map((r) => r.id) },
        userId: null,
        status: { in: ['REQUESTED', 'SCHEDULED', 'PROVISIONING', 'RUNNING', 'DEGRADED'] },
      },
      _count: true,
    });
    return rules.map((r) => {
      let readyCount = 0;
      let warmingCount = 0;
      for (const c of counts) {
        if (c.stagingId !== r.id) continue;
        if (c.status === 'RUNNING') readyCount += c._count;
        else warmingCount += c._count;
      }
      return { ...r, readyCount, warmingCount };
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
    if (ws.type && ws.type !== 'CONTAINER') {
      throw new BadRequestException('Only container workspaces can be pre-warmed (staged).');
    }
    // Reject up front if the org's mounts are per-user (can't be shared across a
    // pre-warmed pool) — the admin sees the reason now, not just in the log.
    const mountBlock = await this.sessions.stagingMountConflict(orgId);
    if (mountBlock) throw new BadRequestException(mountBlock);

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
