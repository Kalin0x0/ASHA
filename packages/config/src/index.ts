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

  // S3-compatible object storage for session recordings. Left blank in dev,
  // which puts recordings into "unconfigured" mode (metadata only, no upload).
  S3_ENDPOINT: z.string().default(''),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().default('chista-recordings'),
  S3_ACCESS_KEY_ID: z.string().default(''),
  S3_SECRET_ACCESS_KEY: z.string().default(''),
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(true),
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
