import { z } from 'zod';

/**
 * Zod-validated environment. Dev-friendly defaults let `pnpm dev:api` boot
 * without a full `.env`; production overrides everything via real secrets.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  DATABASE_URL: z
    .string()
    .default('postgresql://asha:asha_dev_change_me@localhost:5432/asha?schema=public'),
  REDIS_URL: z.string().default('redis://localhost:6379'),

  API_PORT: z.coerce.number().default(4000),
  CORS_ORIGIN: z.string().default('http://localhost:3000,https://asha.local'),

  JWT_ACCESS_SECRET: z.string().min(16).default('dev-access-secret-change-me-please-32++chars'),
  JWT_REFRESH_SECRET: z.string().min(16).default('dev-refresh-secret-change-me-please-32++chars'),
  JWT_ACCESS_TTL: z.coerce.number().default(900),
  JWT_REFRESH_TTL: z.coerce.number().default(2_592_000),

  SESSION_TOKEN_SECRET: z.string().min(16).default('dev-session-token-secret-change-me-32++chars'),
  SESSION_TOKEN_TTL: z.coerce.number().default(120),
  /**
   * Lifetime of the cookie the session forward-auth gate hands out, in seconds.
   *
   * Deliberately much longer than SESSION_TOKEN_TTL: that token is a one-shot
   * bearer for the first navigation, while this cookie carries the whole viewing
   * session — at 120s the stream would drop on the first socket reconnect. A
   * stale cookie unlocks nothing, because the session's Traefik route disappears
   * with its container.
   */
  SESSION_COOKIE_TTL: z.coerce.number().default(43_200),
  /**
   * SameSite for that cookie. `Lax` is right when workspaces are served from the
   * app's own site (the default), and blocks a foreign page from framing a live
   * desktop and driving it. Set `None` only when WORKSPACE_PUBLIC_BASE_URL puts
   * sessions on a genuinely different site, where the viewer's iframe is
   * cross-site and Lax would never send the cookie at all.
   */
  SESSION_COOKIE_SAMESITE: z.enum(['Lax', 'None', 'Strict']).default('Lax'),

  SECRET_SEAL_KEY: z.string().default('0123456789abcdef0123456789abcdef'),
  GUAC_CRYPT_SECRET: z.string().length(32).default('MySuperSecretKeyForParamsToken12'),

  ASHA_BASE_DOMAIN: z.string().default('asha.local'),
  ASHA_PUBLIC_URL: z.string().default('https://asha.local'),
  ASHA_SESSION_NETWORK: z.string().default('asha-sessions'),

  // Public base URL the browser uses to reach a running workspace stream. Takes
  // precedence over ASHA_PUBLIC_URL for session connection URLs when set;
  // point it at the reverse proxy that is actually reachable from end users
  // (e.g. https://workspaces.example.com). A per-zone `proxyBaseUrl` still wins
  // over this. Leave unset to fall back to ASHA_PUBLIC_URL.
  WORKSPACE_PUBLIC_BASE_URL: z.string().url().optional(),

  // Shared secret the agent presents (x-agent-token header) to the internal
  // agent endpoints. Must match the agent's ASHA_AGENT_ENROLLMENT_TOKEN.
  ASHA_AGENT_ENROLLMENT_TOKEN: z.string().min(8).default('dev-enrollment-token-change-me'),

  // WireGuard reverse tunnel (reachability for hosts behind NAT). When the
  // endpoint + server public key are set, the host agent can request a tunnel
  // config and join Asha's WireGuard network; sessions then reach the host
  // over its assigned tunnel IP. Leave the endpoint blank to disable tunneling.
  ASHA_WG_ENDPOINT: z.string().default(''), // e.g. tunnel.example.com:51820
  ASHA_WG_SERVER_PUBLIC_KEY: z.string().default(''),
  ASHA_WG_SUBNET: z.string().default('10.77.0.0/24'),
  ASHA_WG_ALLOWED_IPS: z.string().default('10.77.0.0/24'), // what the host routes via wg

  // S3-compatible object storage for session recordings. Left blank in dev,
  // which puts recordings into "unconfigured" mode (metadata only, no upload).
  S3_ENDPOINT: z.string().default(''),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().default('asha-recordings'),
  S3_ACCESS_KEY_ID: z.string().default(''),
  S3_SECRET_ACCESS_KEY: z.string().default(''),
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(true),

  // Automated Postgres backups (pg_dump). Disabled by default; when enabled the
  // scheduler writes a dump into BACKUP_DIR on the cron below and prunes old ones.
  BACKUP_ENABLED: z.coerce.boolean().default(false),
  BACKUP_DIR: z.string().default('/var/lib/asha/backups'),
  BACKUP_CRON: z.string().default('0 3 * * *'),
  BACKUP_RETENTION: z.coerce.number().int().min(1).default(7),
});

export type Env = z.infer<typeof envSchema>;

/**
 * The development defaults above that are security-critical. They exist so
 * `pnpm dev:api` boots without a full `.env`, but this is an open-source
 * self-hosted product: every one of these strings is published in this
 * repository, so a deployment still holding one is signing tokens (or sealing
 * credentials) with a key the whole internet can read. Production must not be
 * allowed to start that way.
 */
const INSECURE_DEFAULTS: Readonly<Record<string, string>> = {
  JWT_ACCESS_SECRET: 'dev-access-secret-change-me-please-32++chars',
  JWT_REFRESH_SECRET: 'dev-refresh-secret-change-me-please-32++chars',
  SESSION_TOKEN_SECRET: 'dev-session-token-secret-change-me-32++chars',
  SECRET_SEAL_KEY: '0123456789abcdef0123456789abcdef',
  GUAC_CRYPT_SECRET: 'MySuperSecretKeyForParamsToken12',
  ASHA_AGENT_ENROLLMENT_TOKEN: 'dev-enrollment-token-change-me',
};

/** Which security-critical values are still at their published dev default. */
export function insecureDefaultsInUse(env: Env): string[] {
  return Object.entries(INSECURE_DEFAULTS)
    .filter(([key, dev]) => (env as unknown as Record<string, unknown>)[key] === dev)
    .map(([key]) => key);
}

export function loadEnv(src: NodeJS.ProcessEnv = process.env): Env {
  const env = envSchema.parse(src);

  // Fail closed rather than booting a production deployment with keys anyone
  // can look up. Development and tests keep the convenient defaults.
  if (env.NODE_ENV === 'production') {
    const weak = insecureDefaultsInUse(env);
    if (weak.length > 0) {
      throw new Error(
        `Refusing to start: ${weak.join(', ')} ${weak.length === 1 ? 'is' : 'are'} still set to the ` +
          'development default shipped in this repository. Generate a unique value for each ' +
          '(e.g. `openssl rand -hex 32`) and set it in the environment before starting in production. ' +
          'GUAC_CRYPT_SECRET must be exactly 32 characters.',
      );
    }
  }

  return env;
}

export function corsOrigins(env: Env): string[] {
  return env.CORS_ORIGIN.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Resolve the public base URL a browser uses to reach a running workspace
 * stream. Precedence: per-zone `proxyBaseUrl` → `WORKSPACE_PUBLIC_BASE_URL` →
 * `ASHA_PUBLIC_URL`. Centralised so the manager never hands the browser a
 * URL built from an ad-hoc default.
 */
export function resolveSessionBaseUrl(
  env: Pick<Env, 'WORKSPACE_PUBLIC_BASE_URL' | 'ASHA_PUBLIC_URL'>,
  zoneProxyBaseUrl?: string | null,
): string {
  return zoneProxyBaseUrl || env.WORKSPACE_PUBLIC_BASE_URL || env.ASHA_PUBLIC_URL;
}

/**
 * True when a URL's host is a non-publicly-resolvable placeholder — the default
 * `*.local` dev domain, or a loopback address. Used to warn operators (and the
 * UI) that the configured workspace URL likely won't resolve for real end users
 * (the `asha.local`-DNS-failure class of bug).
 */
export function isPlaceholderHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.endsWith('.local') || host === 'localhost' || host === '127.0.0.1' || host === '::1';
  } catch {
    return false;
  }
}
