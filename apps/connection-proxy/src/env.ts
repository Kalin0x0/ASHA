/**
 * Development fallbacks for the secret this process verifies user tokens with.
 * Both strings are published in this repository — the second is compose's
 * fallback for the API's JWT_ACCESS_SECRET, which is what gets forwarded here —
 * so anyone could mint a token and open any session's stream. Never in prod.
 */
const DEV_JWT_SECRETS = ['dev-jwt-secret-change-me', 'dev-access-secret-change-me-please-32++chars'];

export const proxyEnv = {
  port: Number(process.env.PROXY_PORT ?? 4100),
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  /** Same secret used by the API to sign access tokens. */
  jwtSecret: process.env.JWT_SECRET ?? DEV_JWT_SECRETS[0]!,
  /** Base URL of the NestJS API for session lookups. */
  apiUrl: process.env.ASHA_API_URL ?? 'http://localhost:4000',
  /** How long (ms) to cache a resolved session in memory to reduce API calls. */
  sessionCacheTtl: Number(process.env.SESSION_CACHE_TTL_MS ?? 10_000),
};

export type ProxyEnv = typeof proxyEnv;

/**
 * Fail closed instead of guarding session streams with a key from the public
 * repository. Call before serving. Development keeps the fallback.
 */
export function assertProductionSecrets(env: ProxyEnv = proxyEnv): void {
  if (process.env.NODE_ENV !== 'production') return;
  if (DEV_JWT_SECRETS.includes(env.jwtSecret)) {
    throw new Error(
      'Refusing to start: JWT_SECRET is still a development default published in this repository. ' +
        "Set it to the API's JWT_ACCESS_SECRET (a unique value, e.g. `openssl rand -hex 32`).",
    );
  }
}
