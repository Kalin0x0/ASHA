import { Injectable, NotFoundException } from '@nestjs/common';
import type { CreatePoolDto, UpdatePoolDto, UpsertAutoscaleDto } from '@asha/contracts';
import { prisma } from '@asha/db';
import { AuditService } from '../../common/audit.service';

/**
 * Server pools group servers/agents for autoscaling. Each pool may carry one
 * AutoscaleConfig (schedule- or load-based) plus a weekly schedule grid.
 */
@Injectable()
export class PoolsService {
  constructor(private readonly audit: AuditService) {}

  list(orgId: string) {
    return prisma.serverPool.findMany({
      where: { orgId },
      orderBy: { name: 'asc' },
      include: {
        autoscaleConfig: { include: { schedules: true } },
        _count: { select: { members: true } },
      },
    });
  }

  async create(orgId: string, actorUserId: string, dto: CreatePoolDto) {
    const created = await prisma.serverPool.create({
      data: {
        orgId,
        name: dto.name,
        kind: dto.kind,
        startupScript: dto.startupScript,
        enabled: dto.enabled,
      },
    });
    await this.audit.record({
      orgId,
      actorUserId,
      action: 'pool.create',
      targetType: 'ServerPool',
      targetId: created.id,
    });
    return created;
  }

  async update(orgId: string, actorUserId: string, id: string, dto: UpdatePoolDto) {
    const res = await prisma.serverPool.updateMany({
      where: { id, orgId },
      data: { name: dto.name, startupScript: dto.startupScript, enabled: dto.enabled },
    });
    if (res.count === 0) throw new NotFoundException('Pool not found');
    await this.audit.record({
      orgId,
      actorUserId,
      action: 'pool.update',
      targetType: 'ServerPool',
      targetId: id,
    });
    return prisma.serverPool.findFirst({ where: { id, orgId } });
  }

  async remove(orgId: string, actorUserId: string, id: string) {
    const res = await prisma.serverPool.deleteMany({ where: { id, orgId } });
    if (res.count === 0) throw new NotFoundException('Pool not found');
    await this.audit.record({
      orgId,
      actorUserId,
      action: 'pool.delete',
      targetType: 'ServerPool',
      targetId: id,
    });
    return { ok: true };
  }

  // ── Autoscale config (one per pool) ───────────────────────────────────────

  /** Create or replace the autoscale config + schedule grid for a pool. */
  async upsertAutoscale(orgId: string, actorUserId: string, poolId: string, dto: UpsertAutoscaleDto) {
    const pool = await prisma.serverPool.findFirst({ where: { id: poolId, orgId } });
    if (!pool) throw new NotFoundException('Pool not found');

    const config = await prisma.$transaction(async (tx) => {
      const cfg = await tx.autoscaleConfig.upsert({
        where: { serverPoolId: poolId },
        create: {
          orgId,
          serverPoolId: poolId,
          mode: dto.mode,
          minStandby: dto.minStandby,
          maxInstances: dto.maxInstances,
          perServerSessionLimit: dto.perServerSessionLimit,
          checkinIntervalSec: dto.checkinIntervalSec,
          downscaleBackoffSec: dto.downscaleBackoffSec,
          vmProviderId: dto.vmProviderId,
          dnsProviderId: dto.dnsProviderId,
        },
        update: {
          mode: dto.mode,
          minStandby: dto.minStandby,
          maxInstances: dto.maxInstances,
          perServerSessionLimit: dto.perServerSessionLimit,
          checkinIntervalSec: dto.checkinIntervalSec,
          downscaleBackoffSec: dto.downscaleBackoffSec,
          vmProviderId: dto.vmProviderId,
          dnsProviderId: dto.dnsProviderId,
        },
      });

      // Replace the schedule grid wholesale when provided.
      if (dto.schedules) {
        await tx.autoscaleSchedule.deleteMany({ where: { autoscaleConfigId: cfg.id } });
        if (dto.schedules.length) {
          await tx.autoscaleSchedule.createMany({
            data: dto.schedules.map((s) => ({
              autoscaleConfigId: cfg.id,
              dayOfWeek: s.dayOfWeek,
              hour: s.hour,
              minStandby: s.minStandby,
              maxInstances: s.maxInstances,
            })),
          });
        }
      }
      return cfg;
    });

    await this.audit.record({
      orgId,
      actorUserId,
      action: 'autoscale.upsert',
      targetType: 'AutoscaleConfig',
      targetId: config.id,
    });
    return prisma.autoscaleConfig.findUnique({
      where: { id: config.id },
      include: { schedules: { orderBy: [{ dayOfWeek: 'asc' }, { hour: 'asc' }] } },
    });
  }

  async removeAutoscale(orgId: string, actorUserId: string, poolId: string) {
    const res = await prisma.autoscaleConfig.deleteMany({ where: { serverPoolId: poolId, orgId } });
    if (res.count === 0) throw new NotFoundException('Autoscale config not found');
    await this.audit.record({
      orgId,
      actorUserId,
      action: 'autoscale.delete',
      targetType: 'AutoscaleConfig',
      targetId: poolId,
    });
    return { ok: true };
  }

  /**
   * Evaluate the desired capacity for a pool *right now* (D5). In SCHEDULE mode
   * the matching weekly slot (dayOfWeek + hour, UTC) wins, otherwise the base
   * config. The result is the plan a scaler acts on — actually provisioning
   * servers via a VM provider is a separate, pluggable step.
   */
  async planAutoscale(orgId: string, poolId: string) {
    const pool = await prisma.serverPool.findFirst({
      where: { id: poolId, orgId },
      include: {
        autoscaleConfig: { include: { schedules: true } },
        _count: { select: { members: true } },
      },
    });
    if (!pool) throw new NotFoundException('Pool not found');
    const cfg = pool.autoscaleConfig;
    if (!cfg) return { configured: false as const, poolId };

    const now = new Date();
    const dayOfWeek = now.getUTCDay();
    const hour = now.getUTCHours();
    const slot =
      cfg.mode === 'SCHEDULE'
        ? (cfg.schedules.find((sc) => sc.dayOfWeek === dayOfWeek && sc.hour === hour) ?? null)
        : null;

    const effectiveMinStandby = slot?.minStandby ?? cfg.minStandby;
    const effectiveMaxInstances = slot?.maxInstances ?? cfg.maxInstances;
    const currentInstances = pool._count.members;
    const desired = Math.max(0, Math.min(effectiveMinStandby, effectiveMaxInstances));
    const delta = desired - currentInstances;
    const action = delta > 0 ? 'scale_up' : delta < 0 ? 'scale_down' : 'none';

    return {
      configured: true as const,
      poolId,
      mode: cfg.mode,
      at: { dayOfWeek, hour, utc: now.toISOString() },
      slotMatched: Boolean(slot),
      effectiveMinStandby,
      effectiveMaxInstances,
      currentInstances,
      desired,
      delta,
      action,
    };
  }
}
