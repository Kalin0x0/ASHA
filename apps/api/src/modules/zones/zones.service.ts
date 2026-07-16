import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CreateZoneDto, UpdateZoneDto } from '@asha/contracts';
import { Prisma, prisma } from '@asha/db';
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
    const zone = await prisma.deploymentZone.findFirst({
      where: { id, orgId },
      include: { _count: { select: { agents: true, servers: true } } },
    });
    if (!zone) throw new NotFoundException('Zone not found');

    // Only the *truly* default zone is protected — promote another first.
    if (zone.isDefault) {
      throw new BadRequestException(
        'This zone is currently the default zone. Please promote another zone first.',
      );
    }

    // Refuse to orphan live workloads: block while the zone still holds active
    // sessions, or any agents/servers are bound to it. Past sessions
    // (DESTROYED/TERMINATING/ERROR) never block deletion — their `zoneId` is
    // nulled by the FK's onDelete: SetNull, so the history row survives without
    // the link.
    const activeSessions = await prisma.session.count({
      where: { zoneId: id, orgId, status: { notIn: ['DESTROYED', 'TERMINATING', 'ERROR'] } },
    });
    if (activeSessions > 0) {
      throw new BadRequestException(
        `This zone has ${activeSessions} active session(s). Terminate or migrate them before deleting it.`,
      );
    }
    if (zone._count.agents > 0 || zone._count.servers > 0) {
      throw new BadRequestException(
        'This zone still has agents or servers attached. Move or remove them before deleting it.',
      );
    }

    // The checks above are not in the same transaction as the delete, so a
    // session/agent that lands in this zone in between still trips the FK.
    // Translate that into the same actionable 409 rather than leaking a raw
    // Prisma P2003 as a 500.
    try {
      await prisma.deploymentZone.deleteMany({ where: { id, orgId } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') {
        throw new ConflictException(
          'This zone was just claimed by a new session, agent or server. Refresh and try again.',
        );
      }
      throw e;
    }
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
