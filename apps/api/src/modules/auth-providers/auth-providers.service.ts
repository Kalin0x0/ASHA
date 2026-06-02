import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateAuthConfigDto,
  CreateSsoMappingDto,
  UpdateAuthConfigDto,
} from '@chista/contracts';
import { prisma } from '@chista/db';
import { AuditService } from '../../common/audit.service';

/**
 * Identity federation: manage external auth providers (OIDC / SAML / LDAP) and
 * the group mappings that map IdP attributes onto Chista groups.
 *
 * Secrets in `config` (clientSecret, bindPassword) are stored inline for now;
 * a production deployment seals them via the secret store referenced by
 * `secretRef`. Every mutation is org-scoped.
 */
@Injectable()
export class AuthProvidersService {
  constructor(private readonly audit: AuditService) {}

  list(orgId: string) {
    return prisma.authConfig.findMany({
      where: { orgId },
      orderBy: [{ priority: 'asc' }, { name: 'asc' }],
    });
  }

  async get(orgId: string, id: string) {
    const cfg = await prisma.authConfig.findFirst({ where: { id, orgId } });
    if (!cfg) throw new NotFoundException('Auth provider not found');
    return cfg;
  }

  async create(orgId: string, actorUserId: string, dto: CreateAuthConfigDto) {
    this.validateConfig(dto.type, dto.config);
    const created = await prisma.authConfig.create({
      data: {
        orgId,
        type: dto.type,
        name: dto.name,
        enabled: dto.enabled,
        priority: dto.priority,
        config: dto.config as object,
      },
    });
    await this.audit.record({
      orgId,
      actorUserId,
      action: 'authprovider.create',
      targetType: 'AuthConfig',
      targetId: created.id,
      metadata: { type: dto.type },
    });
    return created;
  }

  async update(orgId: string, actorUserId: string, id: string, dto: UpdateAuthConfigDto) {
    const existing = await prisma.authConfig.findFirst({ where: { id, orgId } });
    if (!existing) throw new NotFoundException('Auth provider not found');
    if (dto.config) this.validateConfig(existing.type, dto.config);

    const res = await prisma.authConfig.updateMany({
      where: { id, orgId },
      data: {
        name: dto.name,
        enabled: dto.enabled,
        priority: dto.priority,
        config: dto.config as object | undefined,
      },
    });
    if (res.count === 0) throw new NotFoundException('Auth provider not found');
    await this.audit.record({
      orgId,
      actorUserId,
      action: 'authprovider.update',
      targetType: 'AuthConfig',
      targetId: id,
    });
    return prisma.authConfig.findFirst({ where: { id, orgId } });
  }

  async remove(orgId: string, actorUserId: string, id: string) {
    const res = await prisma.authConfig.deleteMany({ where: { id, orgId } });
    if (res.count === 0) throw new NotFoundException('Auth provider not found');
    await this.audit.record({
      orgId,
      actorUserId,
      action: 'authprovider.delete',
      targetType: 'AuthConfig',
      targetId: id,
    });
    return { ok: true };
  }

  // ── SSO group mappings ────────────────────────────────────────────────────

  listMappings(orgId: string, authConfigId: string) {
    return prisma.ssoMapping.findMany({
      where: { orgId, authConfigId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createMapping(orgId: string, actorUserId: string, dto: CreateSsoMappingDto) {
    // Confirm both the provider and the target group belong to this org.
    const [cfg, group] = await Promise.all([
      prisma.authConfig.findFirst({ where: { id: dto.authConfigId, orgId } }),
      prisma.group.findFirst({ where: { id: dto.groupId, orgId } }),
    ]);
    if (!cfg) throw new NotFoundException('Auth provider not found');
    if (!group) throw new NotFoundException('Group not found');

    const created = await prisma.ssoMapping.create({
      data: {
        orgId,
        authConfigId: dto.authConfigId,
        groupId: dto.groupId,
        attribute: dto.attribute,
        value: dto.value,
      },
    });
    await this.audit.record({
      orgId,
      actorUserId,
      action: 'authprovider.mapping.create',
      targetType: 'SsoMapping',
      targetId: created.id,
    });
    return created;
  }

  async removeMapping(orgId: string, actorUserId: string, id: string) {
    const res = await prisma.ssoMapping.deleteMany({ where: { id, orgId } });
    if (res.count === 0) throw new NotFoundException('Mapping not found');
    await this.audit.record({
      orgId,
      actorUserId,
      action: 'authprovider.mapping.delete',
      targetType: 'SsoMapping',
      targetId: id,
    });
    return { ok: true };
  }

  /**
   * Minimal per-type config validation so a misconfigured provider is rejected
   * at write time rather than failing opaquely at login.
   */
  private validateConfig(type: string, config: Record<string, unknown>) {
    const need = (keys: string[]) => {
      const missing = keys.filter((k) => !config[k]);
      if (missing.length) {
        throw new BadRequestException(`${type} config missing: ${missing.join(', ')}`);
      }
    };
    if (type === 'OIDC') need(['issuer', 'clientId']);
    if (type === 'SAML') need(['idpMetadataUrl', 'spEntityId']);
    if (type === 'LDAP') need(['url', 'baseDN']);
  }
}
