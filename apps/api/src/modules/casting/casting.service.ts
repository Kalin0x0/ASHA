import { randomBytes } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import type { CreateCastingDto, UpdateCastingDto } from '@chista/contracts';
import { prisma } from '@chista/db';
import { AuditService } from '../../common/audit.service';

/**
 * Casting: publish a workspace behind a stable public key (kiosk / digital
 * signage / shared-link delivery). The generated `key` is the public handle a
 * guest hits to launch the cast; everything else is org-scoped admin config.
 */
@Injectable()
export class CastingService {
  constructor(private readonly audit: AuditService) {}

  list(orgId: string) {
    return prisma.castingConfig.findMany({
      where: { orgId },
      orderBy: { createdAt: 'desc' },
      include: { workspace: { select: { id: true, name: true, friendlyName: true } } },
    });
  }

  async create(orgId: string, actorUserId: string, dto: CreateCastingDto) {
    const ws = await prisma.workspace.findFirst({ where: { id: dto.workspaceId, orgId } });
    if (!ws) throw new NotFoundException('Workspace not found');

    const created = await prisma.castingConfig.create({
      data: {
        orgId,
        workspaceId: dto.workspaceId,
        key: randomBytes(12).toString('base64url'),
        allowAnonymous: dto.allowAnonymous,
        requireAuth: dto.requireAuth,
        groupId: dto.groupId,
        errorPageId: dto.errorPageId,
        maxConcurrent: dto.maxConcurrent,
        enabled: dto.enabled,
      },
    });
    await this.audit.record({
      orgId,
      actorUserId,
      action: 'casting.create',
      targetType: 'CastingConfig',
      targetId: created.id,
    });
    return created;
  }

  async update(orgId: string, actorUserId: string, id: string, dto: UpdateCastingDto) {
    const res = await prisma.castingConfig.updateMany({
      where: { id, orgId },
      data: {
        allowAnonymous: dto.allowAnonymous,
        requireAuth: dto.requireAuth,
        groupId: dto.groupId,
        errorPageId: dto.errorPageId,
        maxConcurrent: dto.maxConcurrent,
        enabled: dto.enabled,
      },
    });
    if (res.count === 0) throw new NotFoundException('Casting config not found');
    await this.audit.record({
      orgId,
      actorUserId,
      action: 'casting.update',
      targetType: 'CastingConfig',
      targetId: id,
    });
    return prisma.castingConfig.findFirst({ where: { id, orgId } });
  }

  async remove(orgId: string, actorUserId: string, id: string) {
    const res = await prisma.castingConfig.deleteMany({ where: { id, orgId } });
    if (res.count === 0) throw new NotFoundException('Casting config not found');
    await this.audit.record({
      orgId,
      actorUserId,
      action: 'casting.delete',
      targetType: 'CastingConfig',
      targetId: id,
    });
    return { ok: true };
  }
}
