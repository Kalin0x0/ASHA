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

  it('refuses a bare request with 401', async () => {
    const res = fakeRes();
    await ctrl.gate('/session/kid1/', undefined, undefined, undefined, res as never);
    expect(res.statusCode).toBe(401);
    // The body reaches the browser verbatim, so it must not confirm whether the
    // session exists.
    expect(res.body).toBe('Unauthorized');
  });

  it('answers 204 for a valid cookie, so Traefik forwards the request', async () => {
    const res = fakeRes();
    await ctrl.gate('/session/kid1/websockify', undefined, undefined, `${SESSION_COOKIE}=${cookieToken('kid1')}`, res as never);
    expect(res.statusCode).toBe(204);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('redirects a valid token to the same URL without it, setting the cookie', async () => {
    const res = fakeRes();
    await ctrl.gate(`/session/kid1/?quality=8&token=${urlToken('kid1')}`, undefined, undefined, undefined, res as never);
    // 302, not 200: Traefik only returns a non-2xx auth response to the browser.
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/session/kid1/?quality=8');
    expect(res.headers.location).not.toContain('token');
  });

  it('sends the browser to the public host, not the internal one', async () => {
    // Traefik resolves the auth response's Location against the URL it called —
    // http://api:4000/api/v1/internal/session-auth — so a relative path reached
    // the browser as http://api:4000/session/…, a Docker name that resolves
    // nowhere, and the desktop never loaded (ERR_NAME_NOT_RESOLVED).
    const res = fakeRes();
    await ctrl.gate(`/session/kid1/?token=${urlToken('kid1')}`, 'asha.example.com', 'https', undefined, res as never);
    expect(res.headers['location']).toBe('https://asha.example.com/session/kid1/');
  });

  it('falls back to a relative location when no host is forwarded', async () => {
    const res = fakeRes();
    await ctrl.gate(`/session/kid1/?token=${urlToken('kid1')}`, undefined, undefined, undefined, res as never);
    expect(res.headers['location']).toBe('/session/kid1/');
  });

  it('scopes the cookie to the one session and keeps it off JavaScript', async () => {
    const res = fakeRes();
    await ctrl.gate(`/session/kid1/?token=${urlToken('kid1')}`, undefined, undefined, undefined, res as never);
    const cookie = res.headers['set-cookie']!;
    // A wider Path would hand session A's cookie to session B's requests.
    expect(cookie).toContain('Path=/session/kid1');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Max-Age=43200');
  });

  it('mints a cookie that outlives the one-shot token', async () => {
    const res = fakeRes();
    await ctrl.gate(`/session/kid1/?token=${urlToken('kid1')}`, undefined, undefined, undefined, res as never);
    const value = /asha_session=([^;]+)/.exec(res.headers['set-cookie']!)![1]!;
    const decoded = jwt.verify<{ exp: number; kasmId: string }>(value, { secret: SECRET });
    expect(decoded.kasmId).toBe('kid1');
    // SESSION_TOKEN_TTL is 120s. A cookie that short would drop the stream on
    // the first socket reconnect, which is the whole reason it is separate.
    expect(decoded.exp - Math.floor(Date.now() / 1000)).toBeGreaterThan(3600);
  });

  it('will not accept a URL token as a cookie, nor a cookie as a URL token', async () => {
    // Each proof is minted for one hop. Without the `typ` split, the long-lived
    // cookie value would work as a `?token=` and skip the exchange entirely.
    const asCookie = fakeRes();
    await ctrl.gate('/session/kid1/', undefined, undefined, `${SESSION_COOKIE}=${urlToken('kid1')}`, asCookie as never);
    expect(asCookie.statusCode).toBe(401);

    const asToken = fakeRes();
    await ctrl.gate(`/session/kid1/?token=${cookieToken('kid1')}`, undefined, undefined, undefined, asToken as never);
    expect(asToken.statusCode).toBe(401);
  });

  it('refuses a token signed with the wrong secret', async () => {
    const res = fakeRes();
    const forged = new JwtService({}).sign({ kasmId: 'kid1' }, { secret: 'another-secret-1234567890', expiresIn: 120 });
    await ctrl.gate(`/session/kid1/?token=${forged}`, undefined, undefined, undefined, res as never);
    expect(res.statusCode).toBe(401);
  });

  it('refuses an expired token', async () => {
    const res = fakeRes();
    const stale = jwt.sign({ kasmId: 'kid1' }, { secret: SECRET, expiresIn: -1 });
    await ctrl.gate(`/session/kid1/?token=${stale}`, undefined, undefined, undefined, res as never);
    expect(res.statusCode).toBe(401);
  });

  it('refuses one session token used against another session', async () => {
    const res = fakeRes();
    await ctrl.gate(`/session/victim/?token=${urlToken('mine')}`, undefined, undefined, undefined, res as never);
    expect(res.statusCode).toBe(401);
  });

  it('scopes the cookie to the root in subdomain mode, where the host scopes it', async () => {
    const res = fakeRes();
    await ctrl.gate(`/?token=${urlToken('kid1')}`, 'kid1.sessions.asha.example', undefined, undefined, res as never);
    expect(res.statusCode).toBe(302);
    expect(res.headers['set-cookie']).toContain('Path=/');
    expect(res.headers.location).toBe('https://kid1.sessions.asha.example/');
  });

  it('honours a SameSite override for split-host deployments', async () => {
    const c = new SessionAuthController(jwt, { ...env, SESSION_COOKIE_SAMESITE: 'None' } as never);
    const res = fakeRes();
    await c.gate(`/session/kid1/?token=${urlToken('kid1')}`, undefined, undefined, undefined, res as never);
    expect(res.headers['set-cookie']).toContain('SameSite=None');
  });
});

/**
 * The gate knows nothing about observation any more, and must not learn it back.
 *
 * Three rounds of review went the other way: a per-session `/observe` router
 * carrying a second KasmVNC credential, a cookie scoped one segment narrower, a
 * per-request read of the observation record. Each fix moved the defect —
 * a credential that outlived its grant, then one that was never minted at all —
 * because a container label cannot be rotated while the container runs. An
 * administrator now watches a container through the capture stream instead, so
 * this gate is back to one job: does this request carry proof for this session.
 */
describe('SessionAuthController — the observe path is nothing special', () => {
  let jwt: JwtService;
  let ctrl: SessionAuthController;
  const cookieToken = (kasmId: string) =>
    jwt.sign({ kasmId, typ: 'sess-cookie' }, { secret: SECRET, expiresIn: 3600 });

  beforeEach(() => {
    jwt = new JwtService({});
    ctrl = new SessionAuthController(jwt, env as never);
  });

  it('takes no second dependency, so nothing is left to read a grant from', () => {
    // The gate used to hold a Redis-backed hold reader, and a request on an
    // observe path was refused unless a window was open. Both are gone with the
    // route; the constructor is the cheapest place to notice one coming back.
    expect(SessionAuthController.length).toBe(2);
  });

  it('mints the same cookie whatever the path under the session', async () => {
    // The observer's cookie used to be scoped to `/session/<id>/observe` and
    // capped at the grant's remaining seconds. No route needs either now, and a
    // shortened cookie left on the write path would drop a user mid-session.
    for (const uri of ['/session/kid1/', '/session/kid1/observe/']) {
      const res = fakeRes();
      const token = jwt.sign({ kasmId: 'kid1' }, { secret: SECRET, expiresIn: 120 });
      await ctrl.gate(`${uri}?token=${token}`, undefined, undefined, undefined, res as never);
      expect(res.headers['set-cookie']).toContain('Path=/session/kid1;');
      expect(res.headers['set-cookie']).toContain('Max-Age=43200');
    }
  });

  it('refuses a token marked for a route that no longer exists', async () => {
    // An `obs`-marked token from the build before this one proves nothing the
    // gate reads; it is a session proof or it is nothing.
    const res = fakeRes();
    const marked = jwt.sign({ kasmId: 'kid1', sub: 'admin1', obs: true }, { secret: SECRET, expiresIn: 120 });
    await ctrl.gate(`/session/kid1/observe/?token=${marked}`, undefined, undefined, undefined, res as never);
    // It still names the right session, so it opens that session — for the one
    // person who could have been handed it. What it may NOT do is buy anything
    // the owner's own token would not, which is what the cookie above pins.
    expect(res.statusCode).toBe(302);
    expect(res.headers['set-cookie']).toContain('Path=/session/kid1;');
  });

  it('forwards an observe path on the ordinary session cookie', async () => {
    // Traefik has no observe router any more, so this is just a sub-path of the
    // desktop its owner already holds a cookie for.
    const res = fakeRes();
    await ctrl.gate(
      '/session/kid1/observe/websockify',
      undefined,
      undefined,
      `${SESSION_COOKIE}=${cookieToken('kid1')}`,
      res as never,
    );
    expect(res.statusCode).toBe(204);
  });
});

/**
 * The write path is untouched by any of it.
 *
 * A user reaching their own desktop must work exactly as it did — the first
 * navigation, reload, resume after a pause, and the audio route — because a
 * regression here takes every user offline rather than only stopping an
 * observation. Pinned across the removal for the same reason it was pinned
 * across the addition.
 */
describe('SessionAuthController — a user’s own desktop is untouched', () => {
  let jwt: JwtService;
  let ctrl: SessionAuthController;
  const urlToken = (kasmId: string) => jwt.sign({ sid: 's1', kasmId }, { secret: SECRET, expiresIn: 120 });
  const cookieToken = (kasmId: string) =>
    jwt.sign({ kasmId, typ: 'sess-cookie' }, { secret: SECRET, expiresIn: 3600 });

  beforeEach(() => {
    jwt = new JwtService({});
    ctrl = new SessionAuthController(jwt, env as never);
  });

  it('serves every request the desktop makes, from the first frame to the last asset', async () => {
    for (const uri of [
      `/session/kid1/?token=${urlToken('kid1')}`,
      '/session/kid1/websockify',
      '/session/kid1/audio',
      '/session/kid1/app/ui.js',
    ]) {
      const res = fakeRes();
      await ctrl.gate(uri, undefined, undefined, `${SESSION_COOKIE}=${cookieToken('kid1')}`, res as never);
      expect(res.statusCode).not.toBe(401);
    }
  });

  it('keeps the full session lifetime on the cookie it mints', async () => {
    const res = fakeRes();
    await ctrl.gate(`/session/kid1/?token=${urlToken('kid1')}`, undefined, undefined, undefined, res as never);
    expect(res.headers['set-cookie']).toContain('Max-Age=43200');
  });

  it('serves the audio route on the session cookie, as it always did', async () => {
    // Same router family, one segment along. A gate that treated it as anything
    // else would kill sound for every user.
    const res = fakeRes();
    await ctrl.gate('/session/kid1/audio', undefined, undefined, `${SESSION_COOKIE}=${cookieToken('kid1')}`, res as never);
    expect(res.statusCode).toBe(204);
  });
});
