import { afterEach, describe, expect, it, vi } from 'vitest';
import { isLikelyUnreachableUrl, isStreamConfigured, resolveStreamUrl } from './stream';

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
    vi.stubEnv('NEXT_PUBLIC_DEMO_STREAM_URL', 'https://asha.local/proxy');
    expect(resolveStreamUrl('abc')).toBe('https://asha.local/proxy/session/abc/');
  });

  it('returns the base unchanged when no kasmId is supplied', () => {
    vi.stubEnv('NEXT_PUBLIC_DEMO_STREAM_URL', 'https://asha.local/proxy');
    expect(resolveStreamUrl()).toBe('https://asha.local/proxy');
  });

  it('returns undefined for a malformed URL', () => {
    vi.stubEnv('NEXT_PUBLIC_DEMO_STREAM_URL', 'not a url');
    expect(resolveStreamUrl('abc')).toBeUndefined();
  });
});

describe('isLikelyUnreachableUrl', () => {
  it('flags a .local stream host when the browser is elsewhere', () => {
    expect(isLikelyUnreachableUrl('https://asha.local/session/abc/', 'app.example.com')).toBe(true);
  });

  it('does not flag when the browser is served from that same .local host', () => {
    expect(isLikelyUnreachableUrl('https://asha.local/session/abc/', 'asha.local')).toBe(false);
  });

  it('does not flag a real public host', () => {
    expect(isLikelyUnreachableUrl('https://workspaces.example.com/session/abc/', 'app.example.com')).toBe(false);
  });

  it('does not flag (so the iframe still tries) when the URL is unparseable', () => {
    expect(isLikelyUnreachableUrl('::::', 'app.example.com')).toBe(false);
  });
});
