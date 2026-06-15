import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from '@chista/db';
import { AuditService } from '../../common/audit.service';

/**
 * Experimental feature-flag framework (H4). A versioned catalog of preview/develop
 * features + per-org toggles with an accept-risk gate. Routes gate on a flag via
 * the @RequireFeature decorator + FeatureGuard. Enables progressive rollout of
 * downstream experimental work (e.g. realtime-collaboration).
 */
@Injectable()
export class ExperimentalFeaturesService {
  constructor(private readonly audit: AuditService) {}

  /** Catalog + this org's effective flag state. */
  async list(orgId: string) {
    const [features, flags] = await Promise.all([
      prisma.experimentalFeature.findMany({ orderBy: { name: 'asc' } }),
      prisma.orgFeatureFlag.findMany({ where: { orgId } }),
    ]);
    const byFeature = new Map(flags.map((f) => [f.featureId, f]));
    return features.map((f) => ({
      name: f.name,
      description: f.description,
      stage: f.stage,
      sinceVersion: f.sinceVersion,
      enabled: byFeature.get(f.id)?.enabled ?? f.enabledByDefault,
      acceptedRisk: byFeature.get(f.id)?.acceptedRisk ?? false,
    }));
  }

  /** Admin: register/update a feature in the catalog (idempotent by name). */
  registerFeature(data: {
    name: string;
    description?: string;
    stage?: string;
    sinceVersion?: string;
    enabledByDefault?: boolean;
  }) {
    const { name, ...rest } = data;
    return prisma.experimentalFeature.upsert({ where: { name }, create: { name, ...rest }, update: rest });
  }

  /** Toggle a feature for an org. Enabling requires an explicit risk acceptance. */
  async setFlag(orgId: string, actorUserId: string, name: string, enabled: boolean, acceptedRisk: boolean) {
    const feature = await prisma.experimentalFeature.findUnique({ where: { name } });
    if (!feature) throw new NotFoundException(`Unknown experimental feature "${name}"`);
    if (enabled && !acceptedRisk) {
      throw new BadRequestException('Enabling an experimental feature requires acceptedRisk=true');
    }
    const flag = await prisma.orgFeatureFlag.upsert({
      where: { orgId_featureId: { orgId, featureId: feature.id } },
      create: { orgId, featureId: feature.id, enabled, acceptedRisk },
      update: { enabled, acceptedRisk },
    });
    await this.audit.record({
      orgId,
      actorUserId,
      action: enabled ? 'feature.enable' : 'feature.disable',
      targetType: 'ExperimentalFeature',
      targetId: feature.id,
      metadata: { name },
    });
    return flag;
  }

  /** Is the feature enabled for this org (flag override, else catalog default)? */
  async isEnabled(orgId: string, name: string): Promise<boolean> {
    const feature = await prisma.experimentalFeature.findUnique({
      where: { name },
      include: { flags: { where: { orgId } } },
    });
    if (!feature) return false;
    return feature.flags[0]?.enabled ?? feature.enabledByDefault;
  }
}
