import { describe, expect, it } from 'vitest';
import {
  routerName,
  sessionConnectionUrl,
  sessionObserveUrl,
  sessionHost,
  sessionPath,
  sessionTraefikLabels,
} from './index';

const base = { kasmId: 'abc123', internalPort: 6901, domain: 'asha.local', network: 'asha-sessions' };

describe('naming helpers', () => {
  it('derives a stable router name', () => {
    expect(routerName('abc123')).toBe('sess-abc123');
  });
  it('derives the session path', () => {
    expect(sessionPath('abc123')).toBe('/session/abc123');
  });
  it('derives the session host', () => {
    expect(sessionHost('abc123', 'asha.local')).toBe('abc123.sessions.asha.local');
  });
});

describe('sessionTraefikLabels — path mode (default)', () => {
  const labels = sessionTraefikLabels(base);

  it('enables traefik on the shared network', () => {
    expect(labels['traefik.enable']).toBe('true');
    expect(labels['traefik.docker.network']).toBe('asha-sessions');
  });

  it('routes by PathPrefix and points the loadbalancer at the internal port', () => {
    expect(labels['traefik.http.routers.sess-abc123.rule']).toBe('PathPrefix(`/session/abc123`)');
    expect(labels['traefik.http.routers.sess-abc123.entrypoints']).toBe('websecure');
    expect(labels['traefik.http.routers.sess-abc123.tls']).toBe('true');
    expect(labels['traefik.http.services.sess-abc123.loadbalancer.server.port']).toBe('6901');
  });

  it('attaches a stripprefix middleware', () => {
    expect(labels['traefik.http.middlewares.sess-abc123-strip.stripprefix.prefixes']).toBe(
      '/session/abc123',
    );
    expect(labels['traefik.http.routers.sess-abc123.middlewares']).toBe('sess-abc123-strip');
  });
});

describe('sessionTraefikLabels — subdomain mode', () => {
  const labels = sessionTraefikLabels({ ...base, mode: 'subdomain' });

  it('routes by Host and skips the stripprefix middleware', () => {
    expect(labels['traefik.http.routers.sess-abc123.rule']).toBe(
      'Host(`abc123.sessions.asha.local`)',
    );
    expect(labels['traefik.http.middlewares.sess-abc123-strip.stripprefix.prefixes']).toBeUndefined();
    expect(labels['traefik.http.routers.sess-abc123.middlewares']).toBeUndefined();
  });
});

describe('sessionTraefikLabels — forward auth', () => {
  it('runs the forward-auth gate BEFORE stripprefix', () => {
    // Order is load-bearing, not cosmetic. Traefik applies middlewares in
    // sequence and shows the forward-auth gate the request as it stands at that
    // point — so with the strip first the gate is handed a path of `/`, with the
    // session id it must check the token against already removed. It would then
    // have nothing to compare, and any session's token would open any session.
    const labels = sessionTraefikLabels({ ...base, forwardAuthMiddleware: 'sess-auth@file' });
    expect(labels['traefik.http.routers.sess-abc123.middlewares']).toBe(
      'sess-auth@file,sess-abc123-strip',
    );
  });

  it('uses only forward-auth in subdomain mode', () => {
    const labels = sessionTraefikLabels({
      ...base,
      mode: 'subdomain',
      forwardAuthMiddleware: 'sess-auth@file',
    });
    expect(labels['traefik.http.routers.sess-abc123.middlewares']).toBe('sess-auth@file');
  });
});

describe('sessionConnectionUrl', () => {
  it('builds a path-routed URL and normalises a trailing slash', () => {
    expect(
      sessionConnectionUrl({ kasmId: 'abc123', proxyBaseUrl: 'https://asha.local/', token: 't0k' }),
    ).toBe(
      'https://asha.local/session/abc123/?path=session/abc123/websockify&resize=remote&quality=8&enable_webp=true&token=t0k',
    );
  });

  it('builds a subdomain URL when mode + domain are given', () => {
    expect(
      sessionConnectionUrl({
        kasmId: 'abc123',
        proxyBaseUrl: 'https://asha.local',
        token: 't0k',
        mode: 'subdomain',
        domain: 'asha.local',
      }),
    ).toBe('https://abc123.sessions.asha.local/?token=t0k');
  });

  it('falls back to path mode when subdomain is requested without a domain', () => {
    expect(
      sessionConnectionUrl({
        kasmId: 'abc123',
        proxyBaseUrl: 'https://asha.local',
        token: 't0k',
        mode: 'subdomain',
      }),
    ).toBe(
      'https://asha.local/session/abc123/?path=session/abc123/websockify&resize=remote&quality=8&enable_webp=true&token=t0k',
    );
  });
});

describe('sessionObserveUrl', () => {
  const CONNECTION =
    'https://asha.local/session/abc123/?path=session/abc123/websockify&resize=remote&quality=8&enable_webp=true&token=t0k';

  it('moves the page AND the stream socket onto the observe router', () => {
    expect(sessionObserveUrl({ connectionUrl: CONNECTION, kasmId: 'abc123', token: 'fresh' })).toBe(
      'https://asha.local/session/abc123/observe/?path=session/abc123/observe/websockify' +
        '&resize=remote&quality=8&enable_webp=true&token=fresh',
    );
  });

  it('leaves `path` unescaped, because the KasmVNC client reads it back verbatim', () => {
    const url = sessionObserveUrl({ connectionUrl: CONNECTION, kasmId: 'abc123', token: 'a b' }) ?? '';
    expect(url).toContain('path=session/abc123/observe/websockify');
    expect(url).toContain('token=a%20b');
  });

  it('refuses a URL it could only half rewrite', () => {
    // Half a rewrite would leave the stream socket on the main router, which
    // carries the write credential — no URL at all is the safe answer.
    expect(
      sessionObserveUrl({
        connectionUrl: 'https://abc123.sessions.asha.local/?token=t0k',
        kasmId: 'abc123',
        token: 'fresh',
      }),
    ).toBeNull();
    expect(
      sessionObserveUrl({ connectionUrl: 'https://asha.local/session/abc123/?token=t0k', kasmId: 'abc123', token: 'f' }),
    ).toBeNull();
    expect(
      sessionObserveUrl({ connectionUrl: CONNECTION.replace(/&token=.*/, ''), kasmId: 'abc123', token: 'f' }),
    ).toBeNull();
  });

  it('keeps the zone host the session already resolved to', () => {
    const zoned = CONNECTION.replace('https://asha.local', 'https://ws.zone-b.example.com');
    expect(sessionObserveUrl({ connectionUrl: zoned, kasmId: 'abc123', token: 'fresh' })).toContain(
      'https://ws.zone-b.example.com/session/abc123/observe/?',
    );
  });
});
