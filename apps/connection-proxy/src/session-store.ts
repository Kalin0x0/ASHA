import { createLogger } from '@asha/logger';
import Redis from 'ioredis';
import { proxyEnv } from './env.js';

const log = createLogger('proxy:session-store');

export interface SessionRecord {
  sessionId: string;
  kasmId: string;
  orgId: string;
  /** Null while the session is an unclaimed staged pool session. */
  userId: string | null;
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
  /** RDP security mode for guacd (any | nla | nla-ext | tls | rdp | vmconnect). */
  security?: string;
  /**
   * RemoteApp (RDS published application) to launch instead of a full desktop.
   * When set, guacd starts the app via the RDP `remote-app` parameters.
   */
  remoteApp?: string;
  remoteAppDir?: string;
  remoteAppArgs?: string;
}

const REDIS_KEY = (kasmId: string) => `asha:proxy:session:${kasmId}`;

export class SessionStore {
  private redis: Redis;
  /** In-process short-lived cache to reduce Redis round-trips under high concurrency. */
  private cache = new Map<string, { record: SessionRecord; expiresAt: number }>();

  constructor() {
    this.redis = new Redis(proxyEnv.redisUrl, { maxRetriesPerRequest: 3, lazyConnect: true });
    this.redis.on('error', (e) => log.warn({ err: e.message }, 'redis error'));
    // Keep `healthy` in sync with the LIVE connection so /health (and any
    // healthcheck consuming it) reflects a Redis drop, not just the initial
    // connect. Previously `healthy` only ever flipped true once in connect().
    this.redis.on('ready', () => {
      this.healthy = true;
    });
    this.redis.on('close', () => {
      this.healthy = false;
    });
    this.redis.on('end', () => {
      this.healthy = false;
    });
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
    const cached = this.cache.get(kasmId);
    if (cached && cached.expiresAt > Date.now()) return cached.record;

    // Bounded poll: the agent writes the proxy record when the session reaches
    // RUNNING, but a viewer can open the WebSocket a few hundred ms before that
    // write lands (the session-list poll sees the kasmId first). Retrying briefly
    // masks that sub-second race so it never surfaces to the user as a 4004
    // "session not found" (~750ms worst case before giving up).
    for (let attempt = 0; attempt < 6; attempt++) {
      const raw = await this.redis.get(REDIS_KEY(kasmId)).catch(() => null);
      if (raw) {
        try {
          const record = JSON.parse(raw) as SessionRecord;
          this.cache.set(kasmId, { record, expiresAt: Date.now() + proxyEnv.sessionCacheTtl });
          return record;
        } catch {
          return null;
        }
      }
      if (attempt < 5) await new Promise((r) => setTimeout(r, 150));
    }
    return null;
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
