import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateDNSProviderDto,
  CreateVMProviderDto,
  UpdateProviderDto,
} from '@asha/contracts';
import type { Env } from '@asha/config';
import { prisma } from '@asha/db';
import { AuditService } from '../../common/audit.service';
import { mergeSealedConfig, redactConfig, sealConfig, unsealConfig } from '../../common/config-seal';
import { ENV } from '../../common/env.module';
import { resolveVMDriver, type VMProviderDriver } from './vm-provider.interface';

/**
 * VM and DNS provider registry. VM providers back autoscaled server pools; DNS
 * providers register per-session/per-server records.
 *
 * Secrets in provider configs (tokens, passwords, private keys) are sealed
 * (AES-256-GCM) into the row's `secretRef`; `config` holds a redacted copy so
 * API responses never expose secrets. Drivers run against the unsealed config.
 */
@Injectable()
export class ProvidersService {
  constructor(
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  // ── VM providers ──────────────────────────────────────────────────────────

  listVM(orgId: string) {
    return prisma.vMProvider.findMany({ where: { orgId }, orderBy: { name: 'asc' } });
  }

  /** Internal: recover the unsealed config for a provider (driver use only). */
  async resolveVMConfig(orgId: string, id: string): Promise<Record<string, unknown> | null> {
    const row = await prisma.vMProvider.findFirst({ where: { id, orgId } });
    if (!row) return null;
    return row.secretRef
      ? unsealConfig(row.secretRef, this.env.SECRET_SEAL_KEY)
      : (row.config as Record<string, unknown>);
  }

  /** Resolve a ready-to-use VM driver for a provider (autoscale runner; D5). */
  async driverFor(orgId: string, id: string): Promise<VMProviderDriver | null> {
    const row = await prisma.vMProvider.findFirst({ where: { id, orgId } });
    if (!row) return null;
    const config = await this.resolveVMConfig(orgId, id);
    if (!config) return null;
    return resolveVMDriver(row.provider, config);
  }

  async createVM(orgId: string, actorUserId: string, dto: CreateVMProviderDto) {
    // Validate the (plaintext) config against the concrete driver up front.
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
        config: redactConfig(dto.config) as object,
        secretRef: sealConfig(dto.config, this.env.SECRET_SEAL_KEY),
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
    const existing = await prisma.vMProvider.findFirst({ where: { id, orgId } });
    if (!existing) throw new NotFoundException('VM provider not found');

    // Merge an incoming config over the sealed one (masked values = unchanged).
    let sealed: string | undefined;
    let redacted: object | undefined;
    if (dto.config) {
      const prev = existing.secretRef
        ? unsealConfig(existing.secretRef, this.env.SECRET_SEAL_KEY)
        : (existing.config as Record<string, unknown>);
      const merged = mergeSealedConfig(prev, dto.config);
      sealed = sealConfig(merged, this.env.SECRET_SEAL_KEY);
      redacted = redactConfig(merged) as object;
    }

    await prisma.vMProvider.update({
      where: { id },
      data: { name: dto.name, config: redacted, secretRef: sealed, enabled: dto.enabled },
    });
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

  /** Internal: recover the unsealed config for a DNS provider. */
  async resolveDNSConfig(orgId: string, id: string): Promise<Record<string, unknown> | null> {
    const row = await prisma.dNSProvider.findFirst({ where: { id, orgId } });
    if (!row) return null;
    return row.secretRef
      ? unsealConfig(row.secretRef, this.env.SECRET_SEAL_KEY)
      : (row.config as Record<string, unknown>);
  }

  async createDNS(orgId: string, actorUserId: string, dto: CreateDNSProviderDto) {
    const created = await prisma.dNSProvider.create({
      data: {
        orgId,
        name: dto.name,
        provider: dto.provider,
        zoneName: dto.zoneName,
        config: redactConfig(dto.config) as object,
        secretRef: sealConfig(dto.config, this.env.SECRET_SEAL_KEY),
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
    const existing = await prisma.dNSProvider.findFirst({ where: { id, orgId } });
    if (!existing) throw new NotFoundException('DNS provider not found');

    let sealed: string | undefined;
    let redacted: object | undefined;
    if (dto.config) {
      const prev = existing.secretRef
        ? unsealConfig(existing.secretRef, this.env.SECRET_SEAL_KEY)
        : (existing.config as Record<string, unknown>);
      const merged = mergeSealedConfig(prev, dto.config);
      sealed = sealConfig(merged, this.env.SECRET_SEAL_KEY);
      redacted = redactConfig(merged) as object;
    }

    await prisma.dNSProvider.update({
      where: { id },
      data: { name: dto.name, zoneName: dto.zoneName, config: redacted, secretRef: sealed, enabled: dto.enabled },
    });
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
