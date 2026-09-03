import 'reflect-metadata';
import { JwtService } from '@nestjs/jwt';
import { beforeEach, describe, expect, it } from 'vitest';
import { SessionAuthController } from './session-auth.controller';
import { SESSION_COOKIE } from './session-auth.logic';

/**
 * The decision rules are covered by session-auth.logic.test. What is exercised
 * here is everything the controller adds on top, with a REAL JwtService so the
 * tokens actually round-trip: the status codes Traefik keys off, the cookie's
 * attributes, and the separation between the one-shot URL token and the cookie.
 *
 * The status codes are not cosmetic. Traefik folds a 2xx auth response into the
 * request it forwards upstream and returns a non-2xx one to the browser verbatim
 * — so a `Set-Cookie` sent with a 200 would never reach anyone, and the exchange
 * has to be a redirect.
 */

const SECRET = 'test-session-secret-at-least-16-chars';
const env = { SESSION_TOKEN_SECRET: SECRET, SESSION_COOKIE_TTL: 43_200, SESSION_COOKIE_SAMESITE: 'Lax' };

/** Minimal stand-in for the express Response the controller writes to. */
function fakeRes() {
  const headers: Record<string, string> = {};
  const out = {
    statusCode: 0,
    body: undefined as string | undefined,
    headers,
    setHeader(k: string, v: string) {
      headers[k.toLowerCase()] = v;
    },
    status(code: number) {
      out.statusCode = code;
      return out;
    },
    send(b: string) {
      out.body = b;
      return out;
    },
    end() {
      return out;
    },
  };
  return out;
}

describe('SessionAuthController', () => {
  let jwt: JwtService;
  let ctrl: SessionAuthController;
  const urlToken = (kasmId: string) => jwt.sign({ kasmId }, { secret: SECRET, expiresIn: 120 });
  const cookieToken = (kasmId: string) =>
    jwt.sign({ kasmId, typ: 'sess-cookie' }, { secret: SECRET, expiresIn: 3600 });

  beforeEach(() => {
    jwt = new JwtService({});
    ctrl = new SessionAuthController(jwt, env as never);
  });

  it('refuses a bare request with 401', () => {
    const res = fakeRes();
    ctrl.gate('/session/kid1/', undefined, undefined, res as never);
    expect(res.statusCode).toBe(401);
    // The body reaches the browser verbatim, so it must not confirm whether the
    // session exists.
    expect(res.body).toBe('Unauthorized');
  });

  it('answers 204 for a valid cookie, so Traefik forwards the request', () => {
    const res = fakeRes();
    ctrl.gate('/session/kid1/websockify', undefined, `${SESSION_COOKIE}=${cookieToken('kid1')}`, res as never);
    expect(res.statusCode).toBe(204);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('redirects a valid token to the same URL without it, setting the cookie', () => {
    const res = fakeRes();
    ctrl.gate(`/session/kid1/?quality=8&token=${urlToken('kid1')}`, undefined, undefined, res as never);
    // 302, not 200: Traefik only returns a non-2xx auth response to the browser.
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/session/kid1/?quality=8');
    expect(res.headers.location).not.toContain('token');
  });

  it('scopes the cookie to the one session and keeps it off JavaScript', () => {
    const res = fakeRes();
    ctrl.gate(`/session/kid1/?token=${urlToken('kid1')}`, undefined, undefined, res as never);
    const cookie = res.headers['set-cookie']!;
    // A wider Path would hand session A's cookie to session B's requests.
    expect(cookie).toContain('Path=/session/kid1');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Max-Age=43200');
  });

  it('mints a cookie that outlives the one-shot token', () => {
    const res = fakeRes();
    ctrl.gate(`/session/kid1/?token=${urlToken('kid1')}`, undefined, undefined, res as never);
    const value = /asha_session=([^;]+)/.exec(res.headers['set-cookie']!)![1]!;
    const decoded = jwt.verify<{ exp: number; kasmId: string }>(value, { secret: SECRET });
    expect(decoded.kasmId).toBe('kid1');
    // SESSION_TOKEN_TTL is 120s. A cookie that short would drop the stream on
    // the first socket reconnect, which is the whole reason it is separate.
    expect(decoded.exp - Math.floor(Date.now() / 1000)).toBeGreaterThan(3600);
  });

  it('will not accept a URL token as a cookie, nor a cookie as a URL token', () => {
    // Each proof is minted for one hop. Without the `typ` split, the long-lived
    // cookie value would work as a `?token=` and skip the exchange entirely.
    const asCookie = fakeRes();
    ctrl.gate('/session/kid1/', undefined, `${SESSION_COOKIE}=${urlToken('kid1')}`, asCookie as never);
    expect(asCookie.statusCode).toBe(401);

    const asToken = fakeRes();
    ctrl.gate(`/session/kid1/?token=${cookieToken('kid1')}`, undefined, undefined, asToken as never);
    expect(asToken.statusCode).toBe(401);
  });

  it('refuses a token signed with the wrong secret', () => {
    const res = fakeRes();
    const forged = new JwtService({}).sign({ kasmId: 'kid1' }, { secret: 'another-secret-1234567890', expiresIn: 120 });
    ctrl.gate(`/session/kid1/?token=${forged}`, undefined, undefined, res as never);
    expect(res.statusCode).toBe(401);
  });

  it('refuses an expired token', () => {
    const res = fakeRes();
    const stale = jwt.sign({ kasmId: 'kid1' }, { secret: SECRET, expiresIn: -1 });
    ctrl.gate(`/session/kid1/?token=${stale}`, undefined, undefined, res as never);
    expect(res.statusCode).toBe(401);
  });

  it('refuses one session token used against another session', () => {
    const res = fakeRes();
    ctrl.gate(`/session/victim/?token=${urlToken('mine')}`, undefined, undefined, res as never);
    expect(res.statusCode).toBe(401);
  });

  it('scopes the cookie to the root in subdomain mode, where the host scopes it', () => {
    const res = fakeRes();
    ctrl.gate(`/?token=${urlToken('kid1')}`, 'kid1.sessions.asha.example', undefined, res as never);
    expect(res.statusCode).toBe(302);
    expect(res.headers['set-cookie']).toContain('Path=/');
    expect(res.headers.location).toBe('/');
  });

  it('honours a SameSite override for split-host deployments', () => {
    const c = new SessionAuthController(jwt, { ...env, SESSION_COOKIE_SAMESITE: 'None' } as never);
    const res = fakeRes();
    c.gate(`/session/kid1/?token=${urlToken('kid1')}`, undefined, undefined, res as never);
    expect(res.headers['set-cookie']).toContain('SameSite=None');
  });
});
