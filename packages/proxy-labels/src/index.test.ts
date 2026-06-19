import { describe, expect, it } from 'vitest';
import {
  routerName,
  sessionConnectionUrl,
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
  it('appends the forward-auth middleware after stripprefix', () => {
    const labels = sessionTraefikLabels({ ...base, forwardAuthMiddleware: 'sess-auth@file' });
    expect(labels['traefik.http.routers.sess-abc123.middlewares']).toBe(
      'sess-abc123-strip,sess-auth@file',
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
