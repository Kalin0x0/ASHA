import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { CreateZoneDto, UpdateZoneDto } from '@chista/contracts';
import { prisma } from '@chista/db';
import { AuditService } from '../../common/audit.service';

/**
 * Deployment zones: logical placement regions for agents, servers, and
 * sessions. Exactly one zone per org is the default; promoting a new default
 * demotes the previous one in the same transaction.
 */
@Injectable()
export class ZonesService {
  constructor(private readonly audit: AuditService) {}

  list(orgId: string) {
    return prisma.deploymentZone.findMany({
      where: { orgId },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      include: { _count: { select: { agents: true, servers: true, sessions: true } } },
    });
  }

  async create(orgId: string, actorUserId: string, dto: CreateZoneDto) {
    const created = await prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.deploymentZone.updateMany({ where: { orgId }, data: { isDefault: false } });
      }
      return tx.deploymentZone.create({
        data: {
          orgId,
          name: dto.name,
          region: dto.region,
          isDefault: dto.isDefault,
          proxyBaseUrl: dto.proxyBaseUrl,
          settings: dto.settings as object,
        },
      });
    });
    await this.audit.record({
      orgId,
      actorUserId,
      action: 'zone.create',
      targetType: 'DeploymentZone',
      targetId: created.id,
    });
    return created;
  }

  async update(orgId: string, actorUserId: string, id: string, dto: UpdateZoneDto) {
    const existing = await prisma.deploymentZone.findFirst({ where: { id, orgId } });
    if (!existing) throw new NotFoundException('Zone not found');

    await prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.deploymentZone.updateMany({ where: { orgId }, data: { isDefault: false } });
      }
      await tx.deploymentZone.updateMany({
        where: { id, orgId },
        data: {
          name: dto.name,
          region: dto.region,
          isDefault: dto.isDefault,
          proxyBaseUrl: dto.proxyBaseUrl,
          settings: dto.settings as object | undefined,
        },
      });
    });
    await this.audit.record({
      orgId,
      actorUserId,
      action: 'zone.update',
      targetType: 'DeploymentZone',
      targetId: id,
    });
    return prisma.deploymentZone.findFirst({ where: { id, orgId } });
  }

  async remove(orgId: string, actorUserId: string, id: string) {
    const zone = await prisma.deploymentZone.findFirst({ where: { id, orgId } });
    if (!zone) throw new NotFoundException('Zone not found');
    if (zone.isDefault) {
      throw new BadRequestException('Cannot delete the default zone; promote another first');
    }
    await prisma.deploymentZone.deleteMany({ where: { id, orgId } });
    await this.audit.record({
      orgId,
      actorUserId,
      action: 'zone.delete',
      targetType: 'DeploymentZone',
      targetId: id,
    });
    return { ok: true };
  }
}
