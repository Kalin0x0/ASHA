import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import type { Env } from '@chista/config';
import { ENV } from './env.module';

/**
 * Thin Redis publisher used to dispatch provision/destroy commands to agents and
 * fan out realtime events. Tolerant of a missing Redis in local dev — publishes
 * become no-ops with a warning rather than crashing the API.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger('Redis');
  readonly client: Redis;
  private connected = false;

  constructor(@Inject(ENV) env: Env) {
    this.client = new Redis(env.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    this.client.on('error', (e) => this.logger.warn(`Redis: ${e.message}`));
    this.client.on('ready', () => {
      this.connected = true;
    });
    this.client.connect().catch(() => this.logger.warn('Redis unreachable — running without pub/sub'));
  }

  async publish(channel: string, message: unknown): Promise<void> {
    if (!this.connected) return;
    try {
      await this.client.publish(channel, JSON.stringify(message));
    } catch (e) {
      this.logger.warn(`publish failed: ${(e as Error).message}`);
    }
  }

  onModuleDestroy(): void {
    this.client.disconnect();
  }
}
