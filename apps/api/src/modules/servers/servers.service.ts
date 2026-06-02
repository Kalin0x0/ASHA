import { Injectable, NotFoundException } from '@nestjs/common';
import type { CreateServerDto, UpdateServerDto } from '@chista/contracts';
import { prisma } from '@chista/db';
import { AuditService } from '../../common/audit.service';

/**
 * Servers: persistent RDP/VNC/SSH hosts (as opposed to ephemeral containers).
 * Each server lives in a zone and may be backed by a VM template for autoscale.
 */
@Injectable()
export class ServersService {
  constructor(private readonly audit: AuditService) {}

  list(orgId: string) {
    return prisma.server.findMany({
      where: { orgId },
      orderBy: { hostname: 'asc' },
      include: { zone: { select: { id: true, name: true } } },
    });
  }

  async create(orgId: string, actorUserId: string, dto: CreateServerDto) {
    const zone = await prisma.deploymentZone.findFirst({ where: { id: dto.zoneId, orgId } });
    if (!zone) throw new NotFoundException('Zone not found');

    const created = await prisma.server.create({
      data: {
        orgId,
        zoneId: dto.zoneId,
        hostname: dto.hostname,
        address: dto.address,
        connectionType: dto.connectionType,
        authMode: dto.authMode,
        continuity: dto.continuity,
        vmTemplate: dto.vmTemplate,
        vmProviderId: dto.vmProviderId,
        maxSessions: dto.maxSessions,
      },
    });
    await this.audit.record({
      orgId,
      actorUserId,
      action: 'server.create',
      targetType: 'Server',
      targetId: created.id,
    });
    return created;
  }

  async update(orgId: string, actorUserId: string, id: string, dto: UpdateServerDto) {
    const res = await prisma.server.updateMany({
      where: { id, orgId },
      data: {
        address: dto.address,
        connectionType: dto.connectionType,
        authMode: dto.authMode,
        continuity: dto.continuity,
        vmTemplate: dto.vmTemplate,
        vmProviderId: dto.vmProviderId,
        maxSessions: dto.maxSessions,
      },
    });
    if (res.count === 0) throw new NotFoundException('Server not found');
    await this.audit.record({
      orgId,
      actorUserId,
      action: 'server.update',
      targetType: 'Server',
      targetId: id,
    });
    return prisma.server.findFirst({ where: { id, orgId } });
  }

  async remove(orgId: string, actorUserId: string, id: string) {
    const res = await prisma.server.deleteMany({ where: { id, orgId } });
    if (res.count === 0) throw new NotFoundException('Server not found');
    await this.audit.record({
      orgId,
      actorUserId,
      action: 'server.delete',
      targetType: 'Server',
      targetId: id,
    });
    return { ok: true };
  }
}
