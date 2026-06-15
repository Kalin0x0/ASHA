import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Env } from '@chista/config';
import type { UpdateLogForwarderDto, UpsertLogForwarderDto } from '@chista/contracts';
import { prisma } from '@chista/db';
import { AuditService } from '../../common/audit.service';
import { mergeSealedConfig, redactConfig, sealConfig, unsealConfig } from '../../common/config-seal';
import { ENV } from '../../common/env.module';

/**
 * Log forwarding to external collectors (SIEM). Stores forwarder definitions and
 * renders a ready-to-run Fluent Bit config — Fluent Bit is the open-source
 * shipper, so no proprietary agent is involved. The rendered config is dropped
 * next to the API/agent containers to ship audit + container logs onward.
 *
 * Secret-looking config fields (API tokens, HEC keys, passwords) are sealed
 * (AES-256-GCM) into the row's `secretRef`; `config` keeps only a redacted copy.
 */
@Injectable()
export class LogForwardingService {
  constructor(
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  list(orgId: string) {
    return prisma.logForwarderConfig.findMany({ where: { orgId }, orderBy: { name: 'asc' } });
  }

  async create(orgId: string, actorUserId: string, dto: UpsertLogForwarderDto) {
    const config = dto.config as Record<string, unknown>;
    const created = await prisma.logForwarderConfig.create({
      data: {
        orgId,
        name: dto.name,
        type: dto.type,
        endpoint: dto.endpoint ?? null,
        config: redactConfig(config) as object,
        secretRef: sealConfig(config, this.env.SECRET_SEAL_KEY),
        enabled: dto.enabled,
      },
    });
    await this.audit.record({ orgId, actorUserId, action: 'logforwarder.create', targetType: 'LogForwarderConfig', targetId: created.id, metadata: { type: dto.type } });
    return created;
  }

  async update(orgId: string, actorUserId: string, id: string, dto: UpdateLogForwarderDto) {
    const existing = await prisma.logForwarderConfig.findFirst({ where: { id, orgId } });
    if (!existing) throw new NotFoundException('Log forwarder not found');

    // Merge the incoming (partial, redacted) config over the previously-sealed
    // one — masked secrets mean "unchanged" — then re-seal and re-redact.
    let config: object | undefined;
    let secretRef: string | undefined;
    if (dto.config !== undefined) {
      const prev = existing.secretRef
        ? unsealConfig(existing.secretRef, this.env.SECRET_SEAL_KEY)
        : (existing.config as Record<string, unknown>);
      const merged = mergeSealedConfig(prev, dto.config as Record<string, unknown>);
      config = redactConfig(merged) as object;
      secretRef = sealConfig(merged, this.env.SECRET_SEAL_KEY);
    }

    await prisma.logForwarderConfig.updateMany({
      where: { id, orgId },
      data: {
        name: dto.name,
        type: dto.type,
        endpoint: dto.endpoint,
        config,
        secretRef,
        enabled: dto.enabled,
      },
    });
    await this.audit.record({ orgId, actorUserId, action: 'logforwarder.update', targetType: 'LogForwarderConfig', targetId: id });
    return prisma.logForwarderConfig.findFirst({ where: { id, orgId } });
  }

  async remove(orgId: string, actorUserId: string, id: string) {
    const res = await prisma.logForwarderConfig.deleteMany({ where: { id, orgId } });
    if (res.count === 0) throw new NotFoundException('Log forwarder not found');
    await this.audit.record({ orgId, actorUserId, action: 'logforwarder.delete', targetType: 'LogForwarderConfig', targetId: id });
    return { ok: true };
  }

  /** Render an open-source Fluent Bit OUTPUT section for this forwarder. */
  async renderFluentBitConfig(orgId: string, id: string): Promise<{ filename: string; content: string }> {
    const fwd = await prisma.logForwarderConfig.findFirst({ where: { id, orgId } });
    if (!fwd) throw new NotFoundException('Log forwarder not found');
    // Resolve the sealed secrets so any secret-bearing field renders correctly.
    const config = fwd.secretRef ? unsealConfig(fwd.secretRef, this.env.SECRET_SEAL_KEY) : fwd.config;
    return { filename: `fluent-bit-${fwd.name}.conf`, content: this.buildConfig({ ...fwd, config }) };
  }

  private buildConfig(fwd: {
    name: string;
    type: string;
    endpoint: string | null;
    config: unknown;
  }): string {
    const cfg = (fwd.config ?? {}) as Record<string, string>;
    const url = (() => {
      try {
        return fwd.endpoint ? new URL(fwd.endpoint) : null;
      } catch {
        throw new BadRequestException(`Forwarder "${fwd.name}" has an invalid endpoint URL`);
      }
    })();
    const host = url?.hostname ?? cfg.host ?? 'localhost';
    const header = `# Fluent Bit output for Chista forwarder "${fwd.name}" (${fwd.type})\n[INPUT]\n    Name        forward\n    Listen      0.0.0.0\n    Port        24224\n\n`;

    switch (fwd.type) {
      case 'syslog':
        return `${header}[OUTPUT]\n    Name              syslog\n    Match             *\n    Host              ${host}\n    Port              ${url?.port || cfg.port || '514'}\n    Mode              ${cfg.mode ?? 'tcp'}\n    Syslog_Format     rfc5424\n    Syslog_Hostname_key host\n`;
      case 'splunk_hec':
        return `${header}[OUTPUT]\n    Name          splunk\n    Match         *\n    Host          ${host}\n    Port          ${url?.port || '8088'}\n    TLS           On\n    Splunk_Token  \${SPLUNK_HEC_TOKEN}\n`;
      case 'elasticsearch':
        return `${header}[OUTPUT]\n    Name      es\n    Match     *\n    Host      ${host}\n    Port      ${url?.port || '9200'}\n    Index     ${cfg.index ?? 'chista'}\n    Suppress_Type_Name On\n`;
      case 'loki':
        return `${header}[OUTPUT]\n    Name      loki\n    Match     *\n    Host      ${host}\n    Port      ${url?.port || '3100'}\n    Labels    job=chista\n`;
      case 'http':
        return `${header}[OUTPUT]\n    Name      http\n    Match     *\n    Host      ${host}\n    Port      ${url?.port || '443'}\n    URI       ${url?.pathname || '/'}\n    Format    json\n    TLS       On\n`;
      default:
        throw new BadRequestException(`Unsupported forwarder type: ${fwd.type}`);
    }
  }
}
