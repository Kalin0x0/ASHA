import { describe, expect, it } from 'vitest';
import { insecureDefaultsInUse, isPlaceholderHost, loadEnv, resolveSessionBaseUrl } from './index';

describe('loadEnv production secret guard', () => {
  // Every one of these defaults is published in this repository, so a
  // production deployment still holding one signs tokens (or seals stored
  // credentials) with a key anyone can read.
  const REAL = {
    JWT_ACCESS_SECRET: 'a'.repeat(48),
    JWT_REFRESH_SECRET: 'b'.repeat(48),
    SESSION_TOKEN_SECRET: 'c'.repeat(48),
    SECRET_SEAL_KEY: 'd'.repeat(48),
    GUAC_CRYPT_SECRET: 'e'.repeat(32), // the schema pins this one to exactly 32
    ASHA_AGENT_ENROLLMENT_TOKEN: 'f'.repeat(48),
  };

  it('boots in development with the convenient defaults', () => {
    expect(() => loadEnv({ NODE_ENV: 'development' } as never)).not.toThrow();
  });

  it('boots in production once every secret is real', () => {
    expect(() => loadEnv({ NODE_ENV: 'production', ...REAL } as never)).not.toThrow();
  });

  it('refuses to start production with no secrets configured at all', () => {
    expect(() => loadEnv({ NODE_ENV: 'production' } as never)).toThrow(/Refusing to start/);
  });

  it.each(Object.keys(REAL))('refuses to start production when %s is left at its default', (key) => {
    const src = { NODE_ENV: 'production', ...REAL } as Record<string, string>;
    delete src[key]; // fall back to the schema default for this one key
    expect(() => loadEnv(src as never)).toThrow(new RegExp(key));
  });

  it('names every offending key, not just the first', () => {
    const src = { NODE_ENV: 'production', ...REAL } as Record<string, string>;
    delete src.JWT_ACCESS_SECRET;
    delete src.GUAC_CRYPT_SECRET;
    expect(() => loadEnv(src as never)).toThrow(/JWT_ACCESS_SECRET[\s\S]*GUAC_CRYPT_SECRET/);
  });

  it('reports which defaults are in use without throwing', () => {
    const env = loadEnv({ NODE_ENV: 'development' } as never);
    expect(insecureDefaultsInUse(env).sort()).toEqual(Object.keys(REAL).sort());
  });
});

describe('resolveSessionBaseUrl', () => {
  const env = { WORKSPACE_PUBLIC_BASE_URL: undefined, ASHA_PUBLIC_URL: 'https://asha.local' };

  it('prefers the per-zone proxyBaseUrl when present', () => {
    expect(resolveSessionBaseUrl(env, 'https://eu.example.com')).toBe('https://eu.example.com');
  });

  it('falls back to WORKSPACE_PUBLIC_BASE_URL when no zone URL', () => {
    expect(
      resolveSessionBaseUrl({ ...env, WORKSPACE_PUBLIC_BASE_URL: 'https://ws.example.com' }, null),
    ).toBe('https://ws.example.com');
  });

  it('falls back to ASHA_PUBLIC_URL last', () => {
    expect(resolveSessionBaseUrl(env, undefined)).toBe('https://asha.local');
  });
});

describe('isPlaceholderHost', () => {
  it('flags the default .local dev domain', () => {
    expect(isPlaceholderHost('https://asha.local/session/abc/')).toBe(true);
    expect(isPlaceholderHost('https://eu.asha.local')).toBe(true);
  });

  it('flags loopback hosts', () => {
    expect(isPlaceholderHost('https://localhost:6901')).toBe(true);
    expect(isPlaceholderHost('http://127.0.0.1:6901')).toBe(true);
  });

  it('accepts a real public host', () => {
    expect(isPlaceholderHost('https://workspaces.example.com/session/x/')).toBe(false);
  });

  it('returns false for an unparseable URL', () => {
    expect(isPlaceholderHost('not a url')).toBe(false);
  });
});
