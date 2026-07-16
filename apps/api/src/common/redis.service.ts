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

  /**
   * Publish a JSON message. Returns whether it was actually sent: `false` when
   * Redis is disconnected or the publish throws. Callers that publish a
   * user-facing command (e.g. provision) MUST check this and fail loudly rather
   * than reporting success while the agent never receives the command.
   */
  async publish(channel: string, message: unknown): Promise<boolean> {
    if (!this.connected) {
      this.logger.error(`publish skipped — Redis not connected (channel ${channel})`);
      return false;
    }
    try {
      await this.client.publish(channel, JSON.stringify(message));
      return true;
    } catch (e) {
      this.logger.error(`publish failed on ${channel}: ${(e as Error).message}`);
      return false;
    }
  }

  /** Read a JSON value written by set(). Null when missing, unparsable, or Redis is down. */
  async get<T = unknown>(key: string): Promise<T | null> {
    if (!this.connected) return null;
    try {
      const raw = await this.client.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch (e) {
      this.logger.warn(`get failed: ${(e as Error).message}`);
      return null;
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
