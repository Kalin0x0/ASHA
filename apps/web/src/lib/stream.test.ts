import { afterEach, describe, expect, it, vi } from 'vitest';
import { isStreamConfigured, resolveStreamUrl } from './stream';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('isStreamConfigured', () => {
  it('is false when the demo stream URL is unset', () => {
    vi.stubEnv('NEXT_PUBLIC_DEMO_STREAM_URL', '');
    expect(isStreamConfigured()).toBe(false);
  });

  it('is true when the demo stream URL is set', () => {
    vi.stubEnv('NEXT_PUBLIC_DEMO_STREAM_URL', 'https://localhost:6901');
    expect(isStreamConfigured()).toBe(true);
  });
});

describe('resolveStreamUrl', () => {
  it('returns undefined when unconfigured', () => {
    vi.stubEnv('NEXT_PUBLIC_DEMO_STREAM_URL', '');
    expect(resolveStreamUrl('abc')).toBeUndefined();
  });

  it('returns a bare origin as-is', () => {
    vi.stubEnv('NEXT_PUBLIC_DEMO_STREAM_URL', 'https://localhost:6901');
    expect(resolveStreamUrl('abc')).toBe('https://localhost:6901');
  });

  it('strips a trailing slash', () => {
    vi.stubEnv('NEXT_PUBLIC_DEMO_STREAM_URL', 'https://localhost:6901/');
    expect(resolveStreamUrl('abc')).toBe('https://localhost:6901');
  });

  it('path-routes per session when the base carries a path', () => {
    vi.stubEnv('NEXT_PUBLIC_DEMO_STREAM_URL', 'https://chista.local/proxy');
    expect(resolveStreamUrl('abc')).toBe('https://chista.local/proxy/session/abc/');
  });

  it('returns the base unchanged when no kasmId is supplied', () => {
    vi.stubEnv('NEXT_PUBLIC_DEMO_STREAM_URL', 'https://chista.local/proxy');
    expect(resolveStreamUrl()).toBe('https://chista.local/proxy');
  });

  it('returns undefined for a malformed URL', () => {
    vi.stubEnv('NEXT_PUBLIC_DEMO_STREAM_URL', 'not a url');
    expect(resolveStreamUrl('abc')).toBeUndefined();
  });
});
