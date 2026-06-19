import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import type { Env } from '@asha/config';
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

  /** Set a JSON value with an optional TTL (seconds). No-op when Redis is down. */
  async set(key: string, value: unknown, ttlSec?: number): Promise<void> {
    if (!this.connected) return;
    try {
      const payload = JSON.stringify(value);
      if (ttlSec) await this.client.set(key, payload, 'EX', ttlSec);
      else await this.client.set(key, payload);
    } catch (e) {
      this.logger.warn(`set failed: ${(e as Error).message}`);
    }
  }

  /** Delete a key. No-op when Redis is down. */
  async del(key: string): Promise<void> {
    if (!this.connected) return;
    try {
      await this.client.del(key);
    } catch (e) {
      this.logger.warn(`del failed: ${(e as Error).message}`);
    }
  }

  onModuleDestroy(): void {
    this.client.disconnect();
  }
}
