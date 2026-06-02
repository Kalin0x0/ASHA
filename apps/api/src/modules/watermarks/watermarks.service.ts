import { Injectable, NotFoundException } from '@nestjs/common';
import type { UpsertWatermarkDto } from '@chista/contracts';
import { prisma } from '@chista/db';
import { AuditService } from '../../common/audit.service';

/**
 * Banner + watermark policy. Configs are scoped to a USER, GROUP, or WORKSPACE
 * (`refId` points at the target). The viewer resolves the most specific config
 * for a session and renders a compliance banner plus a diagonal forensic
 * watermark, expanding tokens like `{{user}}` / `{{date}}` at render time.
 */
@Injectable()
export class WatermarksService {
  constructor(private readonly audit: AuditService) {}

  list(orgId: string) {
    return prisma.bannerWatermarkConfig.findMany({ where: { orgId }, orderBy: { updatedAt: 'desc' } });
  }

  async upsert(orgId: string, actorUserId: string, dto: UpsertWatermarkDto) {
    // One config per (scope, refId) target — update in place when it exists.
    const existing = await prisma.bannerWatermarkConfig.findFirst({
      where: { orgId, scope: dto.scope, refId: dto.refId ?? null },
    });
    const data = {
      scope: dto.scope,
      refId: dto.refId ?? null,
      bannerText: dto.bannerText ?? null,
      bannerColor: dto.bannerColor ?? null,
      watermarkText: dto.watermarkText ?? null,
      watermarkOpacity: dto.watermarkOpacity,
    };
    const saved = existing
      ? await prisma.bannerWatermarkConfig.update({ where: { id: existing.id }, data })
      : await prisma.bannerWatermarkConfig.create({ data: { orgId, ...data } });
    await this.audit.record({
      orgId,
      actorUserId,
      action: existing ? 'watermark.update' : 'watermark.create',
      targetType: 'BannerWatermarkConfig',
      targetId: saved.id,
      metadata: { scope: dto.scope, refId: dto.refId },
    });
    return saved;
  }

  async remove(orgId: string, actorUserId: string, id: string) {
    const res = await prisma.bannerWatermarkConfig.deleteMany({ where: { id, orgId } });
    if (res.count === 0) throw new NotFoundException('Watermark config not found');
    await this.audit.record({ orgId, actorUserId, action: 'watermark.delete', targetType: 'BannerWatermarkConfig', targetId: id });
    return { ok: true };
  }

  /**
   * Resolve the effective overlay for a session. Specificity wins:
   * WORKSPACE → GROUP → USER (workspace is most specific). Watermark tokens are
   * expanded so the viewer can render them verbatim.
   */
  async resolveForSession(orgId: string, ctx: { userId: string; groupIds: string[]; workspaceId: string }) {
    const configs = await prisma.bannerWatermarkConfig.findMany({ where: { orgId } });
    const byScope = (scope: string, ids: string[]) =>
      configs.find((c) => c.scope === scope && c.refId != null && ids.includes(c.refId));

    const resolved =
      byScope('WORKSPACE', [ctx.workspaceId]) ?? byScope('GROUP', ctx.groupIds) ?? byScope('USER', [ctx.userId]);
    if (!resolved) return null;

    return {
      bannerText: resolved.bannerText,
      bannerColor: resolved.bannerColor,
      watermarkText: this.expand(resolved.watermarkText, ctx.userId),
      watermarkOpacity: resolved.watermarkOpacity,
    };
  }

  private expand(template: string | null, userId: string): string | null {
    if (!template) return template;
    return template
      .replace(/\{\{\s*user\s*\}\}/g, userId)
      .replace(/\{\{\s*date\s*\}\}/g, new Date().toISOString().slice(0, 10));
  }
}
