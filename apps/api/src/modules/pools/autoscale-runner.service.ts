import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { prisma } from '@asha/db';
import { ProvidersService } from '../providers/providers.service';
import { PoolsService } from './pools.service';

/**
 * Autoscale runner (D5). Periodically evaluates each pool's plan
 * (PoolsService.planAutoscale) and reconciles capacity by driving the pool's VM
 * provider. Disabled by default — set ASHA_AUTOSCALE_RUNNER=true to arm the
 * scheduled loop (real provider create/destroy). runPool() is the verifiable
 * core (drive it directly with a mocked driver — no cloud needed).
 */
@Injectable()
export class AutoscaleRunnerService {
  private readonly log = new Logger('autoscale-runner');

  constructor(
    private readonly pools: PoolsService,
    private readonly providers: ProvidersService,
  ) {}

  @Interval(60_000)
  async runAll() {
    if (process.env.ASHA_AUTOSCALE_RUNNER !== 'true') return [];
    const configs = await prisma.autoscaleConfig.findMany({ select: { orgId: true, serverPoolId: true } });
    const results: unknown[] = [];
    for (const cfg of configs) {
      try {
        results.push(await this.runPool(cfg.orgId, cfg.serverPoolId));
      } catch (e) {
        this.log.warn(`autoscale pool ${cfg.serverPoolId}: ${(e as Error).message}`);
      }
    }
    return results;
  }

  /** Reconcile a single pool: provision missing capacity via its VM provider. */
  async runPool(orgId: string, poolId: string) {
    const plan = await this.pools.planAutoscale(orgId, poolId);
    if (!plan.configured) return { poolId, skipped: 'unconfigured' as const };
    if (plan.action !== 'scale_up' || plan.delta <= 0) {
      return { poolId, action: plan.action, delta: plan.delta, created: 0 };
    }
    const cfg = await prisma.autoscaleConfig.findUnique({
      where: { serverPoolId: poolId },
      select: { vmProviderId: true },
    });
    if (!cfg?.vmProviderId) return { poolId, action: plan.action, delta: plan.delta, created: 0, note: 'no VM provider' };
    const driver = await this.providers.driverFor(orgId, cfg.vmProviderId);
    if (!driver) return { poolId, error: 'driver unresolved' as const };
    const zone = await prisma.deploymentZone.findFirst({
      where: { orgId },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      select: { id: true },
    });
    if (!zone) return { poolId, error: 'no zone' as const };

    let created = 0;
    for (let i = 0; i < plan.delta; i += 1) {
      const inst = await driver.createInstance({ template: '', name: `pool-${poolId.slice(0, 8)}-${i}` });
      const server = await prisma.server.create({
        data: {
          orgId,
          zoneId: zone.id,
          hostname: inst.name,
          address: inst.address ?? '',
          vmProviderId: cfg.vmProviderId,
          status: 'OFFLINE',
          maxSessions: 1,
        },
      });
      await prisma.serverPoolMember.create({ data: { poolId, serverId: server.id } });
      created += 1;
    }
    return { poolId, action: plan.action, delta: plan.delta, created };
  }
}
