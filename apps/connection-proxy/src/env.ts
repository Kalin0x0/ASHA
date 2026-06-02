export const proxyEnv = {
  port: Number(process.env.PROXY_PORT ?? 4100),
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  /** Same secret used by the API to sign access tokens. */
  jwtSecret: process.env.JWT_SECRET ?? 'dev-jwt-secret-change-me',
  /** Base URL of the NestJS API for session lookups. */
  apiUrl: process.env.CHISTA_API_URL ?? 'http://localhost:4000',
  /** How long (ms) to cache a resolved session in memory to reduce API calls. */
  sessionCacheTtl: Number(process.env.SESSION_CACHE_TTL_MS ?? 10_000),
};

export type ProxyEnv = typeof proxyEnv;
