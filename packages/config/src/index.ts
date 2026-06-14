import { z } from 'zod';

/**
 * Zod-validated environment. Dev-friendly defaults let `pnpm dev:api` boot
 * without a full `.env`; production overrides everything via real secrets.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  DATABASE_URL: z
    .string()
    .default('postgresql://chista:chista_dev_change_me@localhost:5432/chista?schema=public'),
  REDIS_URL: z.string().default('redis://localhost:6379'),

  API_PORT: z.coerce.number().default(4000),
  CORS_ORIGIN: z.string().default('http://localhost:3000,https://chista.local'),

  JWT_ACCESS_SECRET: z.string().min(16).default('dev-access-secret-change-me-please-32++chars'),
  JWT_REFRESH_SECRET: z.string().min(16).default('dev-refresh-secret-change-me-please-32++chars'),
  JWT_ACCESS_TTL: z.coerce.number().default(900),
  JWT_REFRESH_TTL: z.coerce.number().default(2_592_000),

  SESSION_TOKEN_SECRET: z.string().min(16).default('dev-session-token-secret-change-me-32++chars'),
  SESSION_TOKEN_TTL: z.coerce.number().default(120),

  SECRET_SEAL_KEY: z.string().default('0123456789abcdef0123456789abcdef'),
  GUAC_CRYPT_SECRET: z.string().length(32).default('MySuperSecretKeyForParamsToken12'),

  CHISTA_BASE_DOMAIN: z.string().default('chista.local'),
  CHISTA_PUBLIC_URL: z.string().default('https://chista.local'),
  CHISTA_SESSION_NETWORK: z.string().default('chista-sessions'),

  // Public base URL the browser uses to reach a running workspace stream. Takes
  // precedence over CHISTA_PUBLIC_URL for session connection URLs when set;
  // point it at the reverse proxy that is actually reachable from end users
  // (e.g. https://workspaces.example.com). A per-zone `proxyBaseUrl` still wins
  // over this. Leave unset to fall back to CHISTA_PUBLIC_URL.
  WORKSPACE_PUBLIC_BASE_URL: z.string().url().optional(),

  // Shared secret the agent presents (x-agent-token header) to the internal
  // agent endpoints. Must match the agent's CHISTA_AGENT_ENROLLMENT_TOKEN.
  CHISTA_AGENT_ENROLLMENT_TOKEN: z.string().min(8).default('dev-enrollment-token-change-me'),

  // S3-compatible object storage for session recordings. Left blank in dev,
  // which puts recordings into "unconfigured" mode (metadata only, no upload).
  S3_ENDPOINT: z.string().default(''),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().default('chista-recordings'),
  S3_ACCESS_KEY_ID: z.string().default(''),
  S3_SECRET_ACCESS_KEY: z.string().default(''),
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(true),

  // Automated Postgres backups (pg_dump). Disabled by default; when enabled the
  // scheduler writes a dump into BACKUP_DIR on the cron below and prunes old ones.
  BACKUP_ENABLED: z.coerce.boolean().default(false),
  BACKUP_DIR: z.string().default('/var/lib/chista/backups'),
  BACKUP_CRON: z.string().default('0 3 * * *'),
  BACKUP_RETENTION: z.coerce.number().int().min(1).default(7),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(src: NodeJS.ProcessEnv = process.env): Env {
  return envSchema.parse(src);
}

export function corsOrigins(env: Env): string[] {
  return env.CORS_ORIGIN.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Resolve the public base URL a browser uses to reach a running workspace
 * stream. Precedence: per-zone `proxyBaseUrl` → `WORKSPACE_PUBLIC_BASE_URL` →
 * `CHISTA_PUBLIC_URL`. Centralised so the manager never hands the browser a
 * URL built from an ad-hoc default.
 */
export function resolveSessionBaseUrl(
  env: Pick<Env, 'WORKSPACE_PUBLIC_BASE_URL' | 'CHISTA_PUBLIC_URL'>,
  zoneProxyBaseUrl?: string | null,
): string {
  return zoneProxyBaseUrl || env.WORKSPACE_PUBLIC_BASE_URL || env.CHISTA_PUBLIC_URL;
}

/**
 * True when a URL's host is a non-publicly-resolvable placeholder — the default
 * `*.local` dev domain, or a loopback address. Used to warn operators (and the
 * UI) that the configured workspace URL likely won't resolve for real end users
 * (the `chista.local`-DNS-failure class of bug).
 */
export function isPlaceholderHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.endsWith('.local') || host === 'localhost' || host === '127.0.0.1' || host === '::1';
  } catch {
    return false;
  }
}
