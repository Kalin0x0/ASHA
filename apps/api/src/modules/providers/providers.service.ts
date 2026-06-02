import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateDNSProviderDto,
  CreateVMProviderDto,
  UpdateProviderDto,
} from '@chista/contracts';
import { prisma } from '@chista/db';
import { AuditService } from '../../common/audit.service';
import { resolveVMDriver } from './vm-provider.interface';

/**
 * VM and DNS provider registry. VM providers back autoscaled server pools; DNS
 * providers register per-session/per-server records. Config is validated
 * against the concrete driver where one exists (Proxmox today).
 */
@Injectable()
export class ProvidersService {
  constructor(private readonly audit: AuditService) {}

  // ── VM providers ──────────────────────────────────────────────────────────

  listVM(orgId: string) {
    return prisma.vMProvider.findMany({ where: { orgId }, orderBy: { name: 'asc' } });
  }

  async createVM(orgId: string, actorUserId: string, dto: CreateVMProviderDto) {
    // If we have a concrete driver, validate the config up front.
    const driver = resolveVMDriver(dto.provider, dto.config);
    if (driver) {
      const check = driver.validateConfig();
      if (!check.ok) throw new BadRequestException(check.reason);
    }

    const created = await prisma.vMProvider.create({
      data: {
        orgId,
        name: dto.name,
        provider: dto.provider,
        config: dto.config as object,
        enabled: dto.enabled,
      },
    });
    await this.audit.record({
      orgId,
      actorUserId,
      action: 'vmprovider.create',
      targetType: 'VMProvider',
      targetId: created.id,
      metadata: { provider: dto.provider },
    });
    return created;
  }

  async updateVM(orgId: string, actorUserId: string, id: string, dto: UpdateProviderDto) {
    const res = await prisma.vMProvider.updateMany({
      where: { id, orgId },
      data: { name: dto.name, config: dto.config as object | undefined, enabled: dto.enabled },
    });
    if (res.count === 0) throw new NotFoundException('VM provider not found');
    await this.audit.record({
      orgId,
      actorUserId,
      action: 'vmprovider.update',
      targetType: 'VMProvider',
      targetId: id,
    });
    return prisma.vMProvider.findFirst({ where: { id, orgId } });
  }

  async removeVM(orgId: string, actorUserId: string, id: string) {
    const res = await prisma.vMProvider.deleteMany({ where: { id, orgId } });
    if (res.count === 0) throw new NotFoundException('VM provider not found');
    await this.audit.record({
      orgId,
      actorUserId,
      action: 'vmprovider.delete',
      targetType: 'VMProvider',
      targetId: id,
    });
    return { ok: true };
  }

  // ── DNS providers ─────────────────────────────────────────────────────────

  listDNS(orgId: string) {
    return prisma.dNSProvider.findMany({ where: { orgId }, orderBy: { name: 'asc' } });
  }

  async createDNS(orgId: string, actorUserId: string, dto: CreateDNSProviderDto) {
    const created = await prisma.dNSProvider.create({
      data: {
        orgId,
        name: dto.name,
        provider: dto.provider,
        zoneName: dto.zoneName,
        config: dto.config as object,
        enabled: dto.enabled,
      },
    });
    await this.audit.record({
      orgId,
      actorUserId,
      action: 'dnsprovider.create',
      targetType: 'DNSProvider',
      targetId: created.id,
      metadata: { provider: dto.provider },
    });
    return created;
  }

  async updateDNS(orgId: string, actorUserId: string, id: string, dto: UpdateProviderDto) {
    const res = await prisma.dNSProvider.updateMany({
      where: { id, orgId },
      data: {
        name: dto.name,
        zoneName: dto.zoneName,
        config: dto.config as object | undefined,
        enabled: dto.enabled,
      },
    });
    if (res.count === 0) throw new NotFoundException('DNS provider not found');
    await this.audit.record({
      orgId,
      actorUserId,
      action: 'dnsprovider.update',
      targetType: 'DNSProvider',
      targetId: id,
    });
    return prisma.dNSProvider.findFirst({ where: { id, orgId } });
  }

  async removeDNS(orgId: string, actorUserId: string, id: string) {
    const res = await prisma.dNSProvider.deleteMany({ where: { id, orgId } });
    if (res.count === 0) throw new NotFoundException('DNS provider not found');
    await this.audit.record({
      orgId,
      actorUserId,
      action: 'dnsprovider.delete',
      targetType: 'DNSProvider',
      targetId: id,
    });
    return { ok: true };
  }
}
