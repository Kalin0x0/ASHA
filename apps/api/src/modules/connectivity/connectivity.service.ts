import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateBrowserIsolationDto,
  CreateConnectionProxyDto,
  CreateEgressGatewayDto,
  CreateWebFilterDto,
  UpdateBrowserIsolationDto,
  UpdateConnectionProxyDto,
  UpdateEgressGatewayDto,
  UpdateWebFilterDto,
} from '@asha/contracts';
import { prisma } from '@asha/db';
import { AuditService } from '../../common/audit.service';

/**
 * Connectivity: manage outbound security controls (egress gateways, web
 * filters, browser isolation) and the Guacamole connection-proxy registry.
 * All resources are org-scoped; `CONNECTIVITY_MANAGE` permission is required.
 */
@Injectable()
export class ConnectivityService {
  constructor(private readonly audit: AuditService) {}

  // ── Connection proxies ───────────────────────────────────────────────────

  listProxies(orgId: string) {
    return prisma.connectionProxyConfig.findMany({ where: { orgId }, orderBy: { name: 'asc' } });
  }

  async createProxy(orgId: string, actorUserId: string, dto: CreateConnectionProxyDto) {
    const created = await prisma.connectionProxyConfig.create({
      data: { orgId, name: dto.name, type: dto.type, host: dto.host, port: dto.port, config: dto.config as object, enabled: dto.enabled },
    });
    await this.audit.record({ orgId, actorUserId, action: 'proxy.create', targetType: 'ConnectionProxyConfig', targetId: created.id });
    return created;
  }

  async updateProxy(orgId: string, actorUserId: string, id: string, dto: UpdateConnectionProxyDto) {
    const res = await prisma.connectionProxyConfig.updateMany({
      where: { id, orgId },
      data: { host: dto.host, port: dto.port, config: dto.config as object | undefined, enabled: dto.enabled },
    });
    if (res.count === 0) throw new NotFoundException('Connection proxy not found');
    await this.audit.record({ orgId, actorUserId, action: 'proxy.update', targetType: 'ConnectionProxyConfig', targetId: id });
    return prisma.connectionProxyConfig.findFirst({ where: { id, orgId } });
  }

  async removeProxy(orgId: string, actorUserId: string, id: string) {
    const res = await prisma.connectionProxyConfig.deleteMany({ where: { id, orgId } });
    if (res.count === 0) throw new NotFoundException('Connection proxy not found');
    await this.audit.record({ orgId, actorUserId, action: 'proxy.delete', targetType: 'ConnectionProxyConfig', targetId: id });
    return { ok: true };
  }

  // ── Egress gateways ──────────────────────────────────────────────────────

  listEgress(orgId: string) {
    return prisma.egressGateway.findMany({ where: { orgId }, orderBy: { name: 'asc' } });
  }

  async createEgress(orgId: string, actorUserId: string, dto: CreateEgressGatewayDto) {
    const created = await prisma.egressGateway.create({
      data: { orgId, name: dto.name, provider: dto.provider, config: dto.config as object, enabled: dto.enabled },
    });
    await this.audit.record({ orgId, actorUserId, action: 'egress.create', targetType: 'EgressGateway', targetId: created.id, metadata: { provider: dto.provider } });
    return created;
  }

  async updateEgress(orgId: string, actorUserId: string, id: string, dto: UpdateEgressGatewayDto) {
    const res = await prisma.egressGateway.updateMany({
      where: { id, orgId },
      data: { config: dto.config as object | undefined, enabled: dto.enabled },
    });
    if (res.count === 0) throw new NotFoundException('Egress gateway not found');
    await this.audit.record({ orgId, actorUserId, action: 'egress.update', targetType: 'EgressGateway', targetId: id });
    return prisma.egressGateway.findFirst({ where: { id, orgId } });
  }

  async removeEgress(orgId: string, actorUserId: string, id: string) {
    const res = await prisma.egressGateway.deleteMany({ where: { id, orgId } });
    if (res.count === 0) throw new NotFoundException('Egress gateway not found');
    await this.audit.record({ orgId, actorUserId, action: 'egress.delete', targetType: 'EgressGateway', targetId: id });
    return { ok: true };
  }

  // ── Web filters ──────────────────────────────────────────────────────────

  listFilters(orgId: string) {
    return prisma.webFilterConfig.findMany({ where: { orgId }, orderBy: { name: 'asc' } });
  }

  async createFilter(orgId: string, actorUserId: string, dto: CreateWebFilterDto) {
    const created = await prisma.webFilterConfig.create({
      data: { orgId, name: dto.name, categories: dto.categories as object, cacheTtl: dto.cacheTtl, enabled: dto.enabled },
    });
    await this.audit.record({ orgId, actorUserId, action: 'webfilter.create', targetType: 'WebFilterConfig', targetId: created.id });
    return created;
  }

  async updateFilter(orgId: string, actorUserId: string, id: string, dto: UpdateWebFilterDto) {
    const res = await prisma.webFilterConfig.updateMany({
      where: { id, orgId },
      data: { categories: dto.categories as object | undefined, cacheTtl: dto.cacheTtl, enabled: dto.enabled },
    });
    if (res.count === 0) throw new NotFoundException('Web filter not found');
    await this.audit.record({ orgId, actorUserId, action: 'webfilter.update', targetType: 'WebFilterConfig', targetId: id });
    return prisma.webFilterConfig.findFirst({ where: { id, orgId } });
  }

  async removeFilter(orgId: string, actorUserId: string, id: string) {
    const res = await prisma.webFilterConfig.deleteMany({ where: { id, orgId } });
    if (res.count === 0) throw new NotFoundException('Web filter not found');
    await this.audit.record({ orgId, actorUserId, action: 'webfilter.delete', targetType: 'WebFilterConfig', targetId: id });
    return { ok: true };
  }

  // ── Browser isolation ────────────────────────────────────────────────────

  listIsolation(orgId: string) {
    return prisma.browserIsolationConfig.findMany({ where: { orgId }, orderBy: { name: 'asc' } });
  }

  async createIsolation(orgId: string, actorUserId: string, dto: CreateBrowserIsolationDto) {
    const created = await prisma.browserIsolationConfig.create({
      data: { orgId, name: dto.name, forwardProxy: dto.forwardProxy, config: dto.config as object, enabled: dto.enabled },
    });
    await this.audit.record({ orgId, actorUserId, action: 'isolation.create', targetType: 'BrowserIsolationConfig', targetId: created.id });
    return created;
  }

  async updateIsolation(orgId: string, actorUserId: string, id: string, dto: UpdateBrowserIsolationDto) {
    const res = await prisma.browserIsolationConfig.updateMany({
      where: { id, orgId },
      data: { forwardProxy: dto.forwardProxy, config: dto.config as object | undefined, enabled: dto.enabled },
    });
    if (res.count === 0) throw new NotFoundException('Browser isolation config not found');
    await this.audit.record({ orgId, actorUserId, action: 'isolation.update', targetType: 'BrowserIsolationConfig', targetId: id });
    return prisma.browserIsolationConfig.findFirst({ where: { id, orgId } });
  }

  async removeIsolation(orgId: string, actorUserId: string, id: string) {
    const res = await prisma.browserIsolationConfig.deleteMany({ where: { id, orgId } });
    if (res.count === 0) throw new NotFoundException('Browser isolation config not found');
    await this.audit.record({ orgId, actorUserId, action: 'isolation.delete', targetType: 'BrowserIsolationConfig', targetId: id });
    return { ok: true };
  }
}
