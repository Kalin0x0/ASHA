import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateAuthConfigDto,
  CreateSsoMappingDto,
  UpdateAuthConfigDto,
} from '@asha/contracts';
import type { Env } from '@asha/config';
import { prisma } from '@asha/db';
import { AuditService } from '../../common/audit.service';
import { mergeSealedConfig, redactConfig, sealConfig, unsealConfig } from '../../common/config-seal';
import { ENV } from '../../common/env.module';

/**
 * Identity federation: manage external auth providers (OIDC / SAML / LDAP) and
 * the group mappings that map IdP attributes onto Asha groups.
 *
 * Secrets in `config` (clientSecret, bindPassword, idpCert) are sealed with
 * AES-256-GCM into `secretRef`; `config` holds a redacted copy for display.
 * Every mutation is org-scoped.
 */
@Injectable()
export class AuthProvidersService {
  constructor(
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  list(orgId: string) {
    return prisma.authConfig.findMany({
      where: { orgId },
      orderBy: [{ priority: 'asc' }, { name: 'asc' }],
    });
  }

  /**
   * Public-safe listing for the login screen: only enabled non-local providers,
   * exposing nothing sensitive (no config/secrets) — just enough to render the
   * SSO buttons and build the right login redirect. When no orgId is given
   * (the pre-auth login page can't know it) the default org is used.
   */
  async publicList(orgId?: string) {
    // Pre-auth login page can't know the org; fall back to the primary
    // (oldest) org. Multi-tenant deployments should pass an explicit orgId.
    const resolvedOrgId =
      orgId ??
      (await prisma.org.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true } }))?.id;
    if (!resolvedOrgId) return [];
    return prisma.authConfig.findMany({
      where: { orgId: resolvedOrgId, enabled: true, type: { in: ['OIDC', 'SAML', 'LDAP'] } },
      orderBy: [{ priority: 'asc' }, { name: 'asc' }],
      select: { id: true, type: true, name: true, orgId: true },
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
        config: redactConfig(dto.config) as object,
        secretRef: sealConfig(dto.config, this.env.SECRET_SEAL_KEY),
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

    const res = await prisma.authConfig.updateMany({
      where: { id, orgId },
      data: {
        name: dto.name,
        enabled: dto.enabled,
        priority: dto.priority,
        config: redacted,
        secretRef: sealed,
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

  /** Internal: recover the unsealed config for a provider (OIDC/SAML/LDAP services). */
  async resolveConfig(id: string): Promise<Record<string, unknown> | null> {
    const row = await prisma.authConfig.findFirst({ where: { id } });
    if (!row) return null;
    return row.secretRef
      ? unsealConfig(row.secretRef, this.env.SECRET_SEAL_KEY)
      : (row.config as Record<string, unknown>);
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
    /** At least one of a set of alternative keys must be present. */
    const needOneOf = (label: string, keys: string[]) => {
      if (!keys.some((k) => config[k])) {
        throw new BadRequestException(`${type} config missing: ${label} (one of ${keys.join(', ')})`);
      }
    };
    if (type === 'OIDC') need(['issuer', 'clientId']);
    if (type === 'SAML') {
      // Validate the fields SamlService.buildClient actually consumes, not the
      // metadata-URL fields (which aren't read), so a saved provider can log in.
      needOneOf('IdP SSO URL', ['entryPoint', 'ssoUrl']);
      needOneOf('IdP certificate', ['idpCert', 'cert']);
    }
    if (type === 'LDAP') need(['url', 'baseDN']);
  }
}
