import { describe, expect, it } from 'vitest';
import {
  SESSION_COOKIE,
  cookiePath,
  decideSessionAuth,
  kasmIdFromHost,
  kasmIdFromPath,
  readCookie,
} from './session-auth.logic';

/**
 * This gate is the only thing standing between a kasmId and a live desktop.
 * Before it existed the forward-auth address was `/health/live`, which returns
 * 200 for everyone, so every session stream was open to anyone who knew the id —
 * with Traefik injecting the container's Basic credentials on the way in.
 */

/** Tokens are stand-ins for verified JWTs: `t:<kasmId>` and `c:<kasmId>`. */
const ask = (over: Partial<Parameters<typeof decideSessionAuth>[0]> = {}) =>
  decideSessionAuth({
    forwardedUri: '/session/kid1/',
    forwardedHost: undefined,
    cookieHeader: undefined,
    readUrlToken: (t) => (t.startsWith('t:') ? t.slice(2) : null),
    readCookieToken: (t) => (t.startsWith('c:') ? t.slice(2) : null),
    ...over,
  });

describe('decideSessionAuth', () => {
  it('refuses a request carrying no proof at all', () => {
    // The whole point. This is what /health/live answered 200 to.
    expect(ask()).toMatchObject({ action: 'deny' });
  });

  it('trades a valid token for a cookie and drops the token from the URL', () => {
    const v = ask({ forwardedUri: '/session/kid1/?path=session/kid1/websockify&quality=8&token=t:kid1' });
    expect(v).toMatchObject({ action: 'exchange', kasmId: 'kid1' });
    // The token must not survive into history, logs or Referer.
    expect((v as { location: string }).location).not.toContain('token');
    // Everything the client actually needs has to survive.
    expect((v as { location: string }).location).toBe(
      '/session/kid1/?path=session%2Fkid1%2Fwebsockify&quality=8',
    );
  });

  it('lets a request with a valid cookie straight through', () => {
    // The steady state: every request after the first has a cookie and no token.
    expect(ask({ cookieHeader: `${SESSION_COOKIE}=c:kid1` })).toEqual({ action: 'allow', kasmId: 'kid1' });
  });

  it('refuses a cookie minted for a different session', () => {
    // Path scoping already narrows the cookie, but a scope is not a claim — a
    // proxy or a rewritten Path must not be able to widen it.
    expect(ask({ cookieHeader: `${SESSION_COOKIE}=c:other` })).toMatchObject({ action: 'deny' });
  });

  it('refuses a token minted for a different session', () => {
    expect(ask({ forwardedUri: '/session/kid1/?token=t:other' })).toMatchObject({ action: 'deny' });
  });

  it('refuses a token that does not verify', () => {
    expect(ask({ forwardedUri: '/session/kid1/?token=forged' })).toMatchObject({ action: 'deny' });
  });

  it('refuses a cookie that does not verify', () => {
    expect(ask({ cookieHeader: `${SESSION_COOKIE}=forged` })).toMatchObject({ action: 'deny' });
  });

  it('prefers the cookie, so the steady state costs no re-exchange', () => {
    const v = ask({
      forwardedUri: '/session/kid1/?token=t:kid1',
      cookieHeader: `${SESSION_COOKIE}=c:kid1`,
    });
    expect(v).toEqual({ action: 'allow', kasmId: 'kid1' });
  });

  it('falls back to a valid token when the cookie is for another session', () => {
    // Two desktops open in one browser: a cookie for the other one must not
    // lock this request out when it carries its own valid token.
    expect(
      ask({ forwardedUri: '/session/kid1/?token=t:kid1', cookieHeader: `${SESSION_COOKIE}=c:other` }),
    ).toMatchObject({ action: 'exchange', kasmId: 'kid1' });
  });

  it('reads the session from the host in subdomain mode', () => {
    expect(
      ask({ forwardedUri: '/?token=t:kid1', forwardedHost: 'kid1.sessions.asha.example' }),
    ).toMatchObject({ action: 'exchange', kasmId: 'kid1' });
  });

  it('refuses when neither the path nor the host names a session', () => {
    expect(ask({ forwardedUri: '/?token=t:kid1', forwardedHost: 'app.example' })).toMatchObject({
      action: 'deny',
    });
  });

  it('refuses when Traefik sent no forwarded URI', () => {
    // Never fail open on a malformed or absent gate call.
    expect(ask({ forwardedUri: undefined })).toMatchObject({ action: 'deny' });
    expect(ask({ forwardedUri: 'http://evil/session/kid1/' })).toMatchObject({ action: 'deny' });
  });
});

describe('kasmIdFromPath', () => {
  it('reads the id only from the leading /session/ segment', () => {
    expect(kasmIdFromPath('/session/kid1/')).toBe('kid1');
    expect(kasmIdFromPath('/session/kid1')).toBe('kid1');
    expect(kasmIdFromPath('/session/kid1/audio')).toBe('kid1');
  });

  it('cannot be spoofed by a later segment', () => {
    // Anchored: otherwise `/other/session/victim` would read as `victim`.
    expect(kasmIdFromPath('/other/session/victim')).toBeNull();
    expect(kasmIdFromPath('/sessionkid1')).toBeNull();
    expect(kasmIdFromPath('/')).toBeNull();
  });
});

describe('kasmIdFromHost', () => {
  it('reads the id from a session subdomain, port and all', () => {
    expect(kasmIdFromHost('kid1.sessions.asha.example')).toBe('kid1');
    expect(kasmIdFromHost('kid1.sessions.asha.example:8443')).toBe('kid1');
  });

  it('ignores a host that is not a session subdomain', () => {
    expect(kasmIdFromHost('app.example')).toBeNull();
    expect(kasmIdFromHost('sessions.asha.example')).toBeNull();
  });
});

describe('readCookie', () => {
  it('finds the cookie among others and leaves near-misses alone', () => {
    expect(readCookie(`a=1; ${SESSION_COOKIE}=xyz; b=2`, SESSION_COOKIE)).toBe('xyz');
    // A prefix match would let `not_asha_session` stand in for the real one.
    expect(readCookie(`not_${SESSION_COOKIE}=xyz`, SESSION_COOKIE)).toBeNull();
    expect(readCookie(undefined, SESSION_COOKIE)).toBeNull();
    expect(readCookie('', SESSION_COOKIE)).toBeNull();
  });
});

describe('cookiePath', () => {
  it('scopes the cookie to the one session in path mode', () => {
    // A wider Path would send session A's cookie along with session B's requests.
    expect(cookiePath('kid1', 'path')).toBe('/session/kid1');
  });

  it('uses the root in subdomain mode, where the host already scopes it', () => {
    expect(cookiePath('kid1', 'subdomain')).toBe('/');
  });
});
