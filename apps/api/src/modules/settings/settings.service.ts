import { Injectable, NotFoundException } from '@nestjs/common';
import type { ImportConfigDto, UpsertBrandingDto, UpsertSettingsDto } from '@asha/contracts';
import { prisma } from '@asha/db';
import { AuditService } from '../../common/audit.service';

/**
 * Org settings: general key/value settings, branding, and a safe config
 * export/import (branding + settings only — never secrets or identities).
 */
@Injectable()
export class SettingsService {
  constructor(private readonly audit: AuditService) {}

  // ── General settings ────────────────────────────────────────────────────────

  listGeneral(orgId: string) {
    return prisma.setting.findMany({ where: { scope: 'ORG', orgId }, orderBy: { key: 'asc' } });
  }

  async upsertGeneral(orgId: string, actorUserId: string, dto: UpsertSettingsDto) {
    for (const { key, value } of dto.settings) {
      await prisma.setting.upsert({
        where: { scope_orgId_zoneId_key: { scope: 'ORG', orgId, zoneId: '', key } },
        create: { scope: 'ORG', orgId, zoneId: '', key, valueJson: value as object },
        update: { valueJson: value as object },
      });
    }
    await this.audit.record({
      orgId,
      actorUserId,
      action: 'settings.update',
      targetType: 'Setting',
      metadata: { keys: dto.settings.map((s) => s.key) },
    });
    return this.listGeneral(orgId);
  }

  // ── Branding ────────────────────────────────────────────────────────────────

  async getBranding(orgId: string) {
    const branding = await prisma.branding.findFirst({ where: { scope: 'ORG', orgId } });
    return (
      branding ?? {
        productName: 'Asha',
        primaryColor: '#1a1a2e',
        accentColor: '#d4af37',
        logoUrl: null,
        faviconUrl: null,
        loginBackgroundUrl: null,
        customCss: null,
      }
    );
  }

  async upsertBranding(orgId: string, actorUserId: string, dto: UpsertBrandingDto) {
    const existing = await prisma.branding.findFirst({ where: { scope: 'ORG', orgId } });
    // Normalise empty strings to null so clearing a field works.
    const data = {
      productName: dto.productName,
      logoUrl: emptyToNull(dto.logoUrl),
      faviconUrl: emptyToNull(dto.faviconUrl),
      loginBackgroundUrl: emptyToNull(dto.loginBackgroundUrl),
      primaryColor: dto.primaryColor,
      accentColor: dto.accentColor,
      customCss: emptyToNull(dto.customCss),
    };
    const result = existing
      ? await prisma.branding.update({ where: { id: existing.id }, data })
      : await prisma.branding.create({ data: { scope: 'ORG', orgId, ...data } });
    await this.audit.record({ orgId, actorUserId, action: 'branding.update', targetType: 'Branding', targetId: result.id });
    return result;
  }

  // ── Group-scoped branding + resolution (G3) ──────────────────────────────────

  getGroupBranding(orgId: string, groupId: string) {
    return prisma.branding.findFirst({ where: { scope: 'GROUP', orgId, groupId } });
  }

  async upsertGroupBranding(orgId: string, actorUserId: string, groupId: string, dto: UpsertBrandingDto) {
    const existing = await prisma.branding.findFirst({ where: { scope: 'GROUP', orgId, groupId } });
    const data = {
      productName: dto.productName,
      logoUrl: emptyToNull(dto.logoUrl),
      faviconUrl: emptyToNull(dto.faviconUrl),
      loginBackgroundUrl: emptyToNull(dto.loginBackgroundUrl),
      primaryColor: dto.primaryColor,
      accentColor: dto.accentColor,
      customCss: emptyToNull(dto.customCss),
    };
    const result = existing
      ? await prisma.branding.update({ where: { id: existing.id }, data })
      : await prisma.branding.create({ data: { scope: 'GROUP', orgId, groupId, ...data } });
    await this.audit.record({
      orgId,
      actorUserId,
      action: 'branding.group.update',
      targetType: 'Branding',
      targetId: result.id,
      metadata: { groupId },
    });
    return result;
  }

  async removeGroupBranding(orgId: string, actorUserId: string, groupId: string) {
    const res = await prisma.branding.deleteMany({ where: { scope: 'GROUP', orgId, groupId } });
    if (res.count === 0) throw new NotFoundException('Group branding not found');
    await this.audit.record({ orgId, actorUserId, action: 'branding.group.delete', targetType: 'Branding', metadata: { groupId } });
    return { ok: true };
  }

  /** Effective branding for a context: GROUP wins over ORG over the built-in default. */
  async resolveBranding(orgId: string, groupId?: string) {
    if (groupId) {
      const g = await prisma.branding.findFirst({ where: { scope: 'GROUP', orgId, groupId } });
      if (g) return { ...g, resolvedFrom: 'GROUP' as const };
    }
    const org = await prisma.branding.findFirst({ where: { scope: 'ORG', orgId } });
    if (org) return { ...org, resolvedFrom: 'ORG' as const };
    return {
      productName: 'Asha',
      primaryColor: '#1a1a2e',
      accentColor: '#d4af37',
      logoUrl: null,
      faviconUrl: null,
      loginBackgroundUrl: null,
      customCss: null,
      resolvedFrom: 'DEFAULT' as const,
    };
  }

  // ── Config export / import ────────────────────────────────────────────────────

  async exportConfig(orgId: string) {
    const [branding, settings] = await Promise.all([
      prisma.branding.findFirst({ where: { scope: 'ORG', orgId } }),
      prisma.setting.findMany({ where: { scope: 'ORG', orgId } }),
    ]);
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      branding: branding
        ? {
            productName: branding.productName,
            // Omit unset (null) URLs/CSS — the import schema accepts string|''|
            // undefined but not null, so emit undefined to keep export→import
            // round-trippable.
            logoUrl: branding.logoUrl ?? undefined,
            faviconUrl: branding.faviconUrl ?? undefined,
            loginBackgroundUrl: branding.loginBackgroundUrl ?? undefined,
            primaryColor: branding.primaryColor,
            accentColor: branding.accentColor,
            customCss: branding.customCss ?? undefined,
          }
        : null,
      settings: settings.map((s) => ({ key: s.key, value: s.valueJson })),
    };
  }

  async importConfig(orgId: string, actorUserId: string, dto: ImportConfigDto) {
    if (dto.branding) await this.upsertBranding(orgId, actorUserId, dto.branding);
    if (dto.settings) await this.upsertGeneral(orgId, actorUserId, { settings: dto.settings });
    await this.audit.record({ orgId, actorUserId, action: 'config.import', targetType: 'Org', targetId: orgId });
    return { ok: true };
  }
}

function emptyToNull(v: string | undefined): string | null | undefined {
  if (v === undefined) return undefined;
  return v === '' ? null : v;
}
