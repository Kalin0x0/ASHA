import { describe, expect, it } from 'vitest';
import { isPlaceholderHost, resolveSessionBaseUrl } from './index';

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
