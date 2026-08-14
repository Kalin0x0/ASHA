import { afterEach, describe, expect, it } from 'vitest';
import { assertProductionSecrets, type ProxyEnv } from './env.js';

const base = { port: 4100, redisUrl: '', apiUrl: '', sessionCacheTtl: 0 };
const original = process.env.NODE_ENV;
afterEach(() => {
  process.env.NODE_ENV = original;
});

describe('assertProductionSecrets', () => {
  // Both fallbacks are published in this repository: whoever knows one can mint
  // a token and open any session's stream.
  it.each(['dev-jwt-secret-change-me', 'dev-access-secret-change-me-please-32++chars'])(
    'refuses to start production with the published fallback %s',
    (secret) => {
      process.env.NODE_ENV = 'production';
      expect(() => assertProductionSecrets({ ...base, jwtSecret: secret } as ProxyEnv)).toThrow(
        /Refusing to start/,
      );
    },
  );

  it('starts in production once a real secret is configured', () => {
    process.env.NODE_ENV = 'production';
    expect(() =>
      assertProductionSecrets({ ...base, jwtSecret: 'x'.repeat(48) } as ProxyEnv),
    ).not.toThrow();
  });

  it('leaves development alone', () => {
    process.env.NODE_ENV = 'development';
    expect(() =>
      assertProductionSecrets({ ...base, jwtSecret: 'dev-jwt-secret-change-me' } as ProxyEnv),
    ).not.toThrow();
  });
});
