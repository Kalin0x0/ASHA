import { createLogger } from '@chista/logger';
import Redis from 'ioredis';
import { proxyEnv } from './env.js';

const log = createLogger('proxy:session-store');

export interface SessionRecord {
  sessionId: string;
  kasmId: string;
  orgId: string;
  userId: string;
  protocol: 'KASMVNC' | 'RDP' | 'VNC' | 'SSH';
  /** Internal host:port of the running container, set by the agent. */
  internalHost?: string;
  internalPort?: number;
  status: string;
  /**
   * Protocol credentials, set by the agent when the container is ready.
   * SSH: the agent generates an ephemeral keypair per session (or a password)
   * and injects the public key / password into the container at launch.
   * RDP/VNC: forwarded to guacd as connection parameters.
   */
  sshUser?: string;
  sshPassword?: string;
  sshPrivateKey?: string;
  rdpUser?: string;
  rdpPassword?: string;
  /**
   * RemoteApp (RDS published application) to launch instead of a full desktop.
   * When set, guacd starts the app via the RDP `remote-app` parameters.
   */
  remoteApp?: string;
  remoteAppDir?: string;
  remoteAppArgs?: string;
}

const REDIS_KEY = (kasmId: string) => `chista:proxy:session:${kasmId}`;

export class SessionStore {
  private redis: Redis;
  /** In-process short-lived cache to reduce Redis round-trips under high concurrency. */
  private cache = new Map<string, { record: SessionRecord; expiresAt: number }>();

  constructor() {
    this.redis = new Redis(proxyEnv.redisUrl, { maxRetriesPerRequest: 3, lazyConnect: true });
    this.redis.on('error', (e) => log.warn({ err: e.message }, 'redis error'));
  }

  private healthy = false;

  async connect(): Promise<void> {
    try {
      await this.redis.connect();
      this.healthy = true;
    } catch (e) {
      log.warn({ err: (e as Error).message }, 'redis connect failed — session lookups will return null');
    }
  }

  isHealthy(): boolean {
    return this.healthy;
  }

  async get(kasmId: string): Promise<SessionRecord | null> {
    const now = Date.now();
    const cached = this.cache.get(kasmId);
    if (cached && cached.expiresAt > now) return cached.record;

    const raw = await this.redis.get(REDIS_KEY(kasmId)).catch(() => null);
    if (!raw) return null;

    try {
      const record = JSON.parse(raw) as SessionRecord;
      this.cache.set(kasmId, { record, expiresAt: now + proxyEnv.sessionCacheTtl });
      return record;
    } catch {
      return null;
    }
  }

  /** Called by the agent when a session reaches RUNNING state. */
  async set(record: SessionRecord, ttlSec = 3600): Promise<void> {
    await this.redis.set(REDIS_KEY(record.kasmId), JSON.stringify(record), 'EX', ttlSec);
    this.cache.delete(record.kasmId);
  }

  async delete(kasmId: string): Promise<void> {
    await this.redis.del(REDIS_KEY(kasmId));
    this.cache.delete(kasmId);
  }

  quit(): void {
    this.redis.quit().catch(() => undefined);
  }
}
