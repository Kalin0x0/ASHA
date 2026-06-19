import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { prisma } from '@asha/db';
import { Public, RequirePermissions } from '../../common/decorators';
import { RedisService } from '../../common/redis.service';

@SkipThrottle()
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly redis: RedisService) {}

  @Public()
  @Get('live')
  live() {
    return { status: 'ok', service: 'asha-api' };
  }

  @Public()
  @Get('ready')
  async ready() {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { status: 'ready', db: 'up' };
    } catch {
      return { status: 'degraded', db: 'down' };
    }
  }

  /** Deep component-level diagnostics (DB, Redis, agents, sessions) for ops/SRE. */
  @RequirePermissions('REPORTING_VIEW')
  @Get('diagnostics')
  async diagnostics() {
    const checks: Record<string, { status: string; detail?: string; latencyMs?: number }> = {};

    const t0 = Date.now();
    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.database = { status: 'up', latencyMs: Date.now() - t0 };
    } catch (e) {
      checks.database = { status: 'down', detail: (e as Error).message };
    }

    const t1 = Date.now();
    try {
      const pong = await this.redis.client.ping();
      checks.redis = { status: pong === 'PONG' ? 'up' : 'degraded', latencyMs: Date.now() - t1 };
    } catch (e) {
      checks.redis = { status: 'down', detail: (e as Error).message };
    }

    const staleBefore = new Date(Date.now() - 90_000);
    const [agentsTotal, agentsOnline, agentsStale] = await Promise.all([
      prisma.agent.count(),
      prisma.agent.count({ where: { status: 'ONLINE', lastHeartbeatAt: { gte: staleBefore } } }),
      prisma.agent.count({ where: { status: 'ONLINE', lastHeartbeatAt: { lt: staleBefore } } }),
    ]);
    checks.agents = {
      status: agentsOnline > 0 ? 'up' : agentsTotal > 0 ? 'degraded' : 'down',
      detail: `${agentsOnline} online, ${agentsStale} stale, ${agentsTotal} total`,
    };

    const [sessActive, sessError] = await Promise.all([
      prisma.session.count({ where: { status: { in: ['RUNNING', 'DEGRADED', 'PAUSED', 'PROVISIONING'] as never } } }),
      prisma.session.count({ where: { status: 'ERROR' } }),
    ]);
    checks.sessions = { status: 'up', detail: `${sessActive} active, ${sessError} error` };

    const values = Object.values(checks);
    const status = values.some((c) => c.status === 'down')
      ? 'down'
      : values.some((c) => c.status === 'degraded')
        ? 'degraded'
        : 'healthy';
    return { status, checks };
  }
}
