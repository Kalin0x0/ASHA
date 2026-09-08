import 'reflect-metadata';
import { JwtService } from '@nestjs/jwt';
import { beforeEach, describe, expect, it } from 'vitest';
import { SessionAuthController } from './session-auth.controller';
import { SESSION_COOKIE } from './session-auth.logic';

/**
 * The decision rules are covered by session-auth.logic.test. What is exercised
 * here is everything the controller adds on top, with a REAL JwtService so the
 * tokens actually round-trip: the status codes Traefik keys off, the cookie's
 * attributes, the separation between the one-shot URL token and the cookie, and
 * the separation between the route an observer may reach and the one that types.
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

/**
 * Stands in for the Redis-backed hold reader. `open` maps `<kasmId>:<observer>`
 * to the epoch ms that observer's window lapses at; anything absent is a window
 * that is not open — which is also what an unreachable Redis reads as.
 */
function fakeGrants(open: Record<string, number> = {}) {
  const asked: Array<[string, string | undefined]> = [];
  return {
    asked,
    async holdExpiry(kasmId: string, observerUserId: string | undefined) {
      asked.push([kasmId, observerUserId]);
      return observerUserId ? (open[`${kasmId}:${observerUserId}`] ?? 0) : 0;
    },
  };
}

describe('SessionAuthController', () => {
  let jwt: JwtService;
  let ctrl: SessionAuthController;
  let grants: ReturnType<typeof fakeGrants>;
  const urlToken = (kasmId: string) => jwt.sign({ kasmId }, { secret: SECRET, expiresIn: 120 });
  const observeUrlToken = (kasmId: string, sub = 'admin1') =>
    jwt.sign({ kasmId, sub, obs: true }, { secret: SECRET, expiresIn: 120 });
  const cookieToken = (kasmId: string) =>
    jwt.sign({ kasmId, typ: 'sess-cookie' }, { secret: SECRET, expiresIn: 3600 });
  const observeCookieToken = (kasmId: string, sub = 'admin1') =>
    jwt.sign({ kasmId, typ: 'sess-cookie', obs: true, sub }, { secret: SECRET, expiresIn: 3600 });

  beforeEach(() => {
    jwt = new JwtService({});
    // One administrator is watching kid1, the hold renewed a moment ago.
    grants = fakeGrants({ 'kid1:admin1': Date.now() + 90_000 });
    ctrl = new SessionAuthController(jwt, env as never, grants as never);
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

  it('scopes an observation cookie to the read-only route it was minted on', async () => {
    const res = fakeRes();
    await ctrl.gate(`/session/kid1/observe/?token=${observeUrlToken('kid1')}`, undefined, undefined, undefined, res as never);
    // One segment narrower than a session cookie: the route above this one is
    // served with the KasmVNC account that may type.
    expect(res.headers['set-cookie']).toContain('Path=/session/kid1/observe');
    expect(res.headers.location).toBe('/session/kid1/observe/');
  });

  it('refuses an observer cookie replayed against the write route', async () => {
    // The Path attribute stops a browser from sending it there at all; this is
    // the same request made by hand.
    const res = fakeRes();
    await ctrl.gate(
      '/session/kid1/websockify',
      undefined,
      undefined,
      `${SESSION_COOKIE}=${observeCookieToken('kid1')}`,
      res as never,
    );
    expect(res.statusCode).toBe(401);
  });

  it('refuses a session cookie on the read-only route, so each stays on its own', async () => {
    const res = fakeRes();
    await ctrl.gate(
      '/session/kid1/observe/websockify',
      undefined,
      undefined,
      `${SESSION_COOKIE}=${cookieToken('kid1')}`,
      res as never,
    );
    expect(res.statusCode).toBe(401);
  });

  it('forwards the observe route once its own cookie is presented', async () => {
    const res = fakeRes();
    await ctrl.gate(
      '/session/kid1/observe/websockify',
      undefined,
      undefined,
      `${SESSION_COOKIE}=${observeCookieToken('kid1')}`,
      res as never,
    );
    expect(res.statusCode).toBe(204);
  });

  it('honours a SameSite override for split-host deployments', async () => {
    const c = new SessionAuthController(jwt, { ...env, SESSION_COOKIE_SAMESITE: 'None' } as never, grants as never);
    const res = fakeRes();
    await c.gate(`/session/kid1/?token=${urlToken('kid1')}`, undefined, undefined, undefined, res as never);
    expect(res.headers['set-cookie']).toContain('SameSite=None');
  });
});

/**
 * The escalation the second review found: SESSION_OBSERVE turning into keyboard
 * and mouse control of a colleague's desktop.
 *
 * The observer's stream token is handed to their own browser and stands in
 * their address bar. It used to be byte-identical to the one a session's owner
 * carries, and this gate does not know which Traefik router called it beyond the
 * path it is given — so lifting the token one segment up, onto
 * `/session/<kasmId>/`, bought a cookie for the route the agent labels with
 * `kasm_user`, the KasmVNC account that may type.
 */
describe('SessionAuthController — the observer may not reach the route that types', () => {
  let jwt: JwtService;
  let ctrl: SessionAuthController;
  const observeUrlToken = (kasmId: string, sub = 'admin1') =>
    jwt.sign({ kasmId, sub, obs: true }, { secret: SECRET, expiresIn: 120 });

  beforeEach(() => {
    jwt = new JwtService({});
    ctrl = new SessionAuthController(
      jwt,
      env as never,
      fakeGrants({ 'kid1:admin1': Date.now() + 90_000 }) as never,
    );
  });

  it('refuses the observer’s stream token on the write route', async () => {
    const res = fakeRes();
    await ctrl.gate(`/session/kid1/?token=${observeUrlToken('kid1')}`, undefined, undefined, undefined, res as never);
    expect(res.statusCode).toBe(401);
    // And nothing was minted on the way to the refusal.
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('refuses it on the audio route as well, which carries the same credential', async () => {
    const res = fakeRes();
    await ctrl.gate(
      `/session/kid1/audio?token=${observeUrlToken('kid1')}`,
      undefined,
      undefined,
      undefined,
      res as never,
    );
    expect(res.statusCode).toBe(401);
  });

  it('refuses an owner’s stream token on the read-only route', async () => {
    // The other direction, and the reason the check is not "observers only":
    // proof is good for the route it was minted for, in both directions.
    const res = fakeRes();
    const owner = jwt.sign({ sid: 's1', kasmId: 'kid1' }, { secret: SECRET, expiresIn: 120 });
    await ctrl.gate(`/session/kid1/observe/?token=${owner}`, undefined, undefined, undefined, res as never);
    expect(res.statusCode).toBe(401);
  });
});

/**
 * The 12-hour cookie: an observation that outlived stop, the watch token and the
 * permission behind it.
 *
 * The credential is minted once and nothing that ends an observation can reach a
 * cookie already in a browser — so the gate asks, on every request, whether the
 * window that authorized it is still open.
 */
describe('SessionAuthController — the observe route lives only as long as the grant', () => {
  let jwt: JwtService;
  const observeUrlToken = (kasmId: string, sub = 'admin1') =>
    jwt.sign({ kasmId, sub, obs: true }, { secret: SECRET, expiresIn: 120 });
  const observeCookieToken = (kasmId: string, sub = 'admin1') =>
    jwt.sign({ kasmId, typ: 'sess-cookie', obs: true, sub }, { secret: SECRET, expiresIn: 3600 });
  const maxAge = (setCookie: string) => Number(/Max-Age=(\d+)/.exec(setCookie)![1]);
  const build = (grants: ReturnType<typeof fakeGrants>) =>
    new SessionAuthController(jwt, env as never, grants as never);

  beforeEach(() => {
    jwt = new JwtService({});
  });

  it('refuses an observe cookie once the observation has stopped', async () => {
    // The report's own reproduction: press stop, then re-open the URL from
    // browser history with no token at all. Before this check that returned a
    // live desktop for the rest of the twelve hours.
    const res = fakeRes();
    await build(fakeGrants()).gate(
      '/session/kid1/observe/websockify',
      undefined,
      undefined,
      `${SESSION_COOKIE}=${observeCookieToken('kid1')}`,
      res as never,
    );
    expect(res.statusCode).toBe(401);
  });

  it('refuses when the hold has lapsed rather than been released', async () => {
    // A closed laptop stops renewing; the hold expires where it lies. The
    // record may well still exist for another observer.
    const res = fakeRes();
    await build(fakeGrants({ 'kid1:admin1': Date.now() - 1 })).gate(
      '/session/kid1/observe/websockify',
      undefined,
      undefined,
      `${SESSION_COOKIE}=${observeCookieToken('kid1')}`,
      res as never,
    );
    expect(res.statusCode).toBe(401);
  });

  it('refuses an observer riding on a colleague’s hold', async () => {
    // Per hold, not per session: admin2 is still watching kid1, admin1 stopped.
    // A check on "is anybody watching" would let admin1 straight back in.
    const res = fakeRes();
    await build(fakeGrants({ 'kid1:admin2': Date.now() + 90_000 })).gate(
      '/session/kid1/observe/websockify',
      undefined,
      undefined,
      `${SESSION_COOKIE}=${observeCookieToken('kid1', 'admin1')}`,
      res as never,
    );
    expect(res.statusCode).toBe(401);
  });

  it('refuses an observe cookie that names nobody', async () => {
    // A cookie from before the observer travelled with the proof cannot be
    // matched to a hold, and an unmatched cookie is not a grant.
    const res = fakeRes();
    const anonymous = jwt.sign({ kasmId: 'kid1', typ: 'sess-cookie', obs: true }, { secret: SECRET, expiresIn: 3600 });
    await build(fakeGrants({ 'kid1:admin1': Date.now() + 90_000 })).gate(
      '/session/kid1/observe/websockify',
      undefined,
      undefined,
      `${SESSION_COOKIE}=${anonymous}`,
      res as never,
    );
    expect(res.statusCode).toBe(401);
  });

  it('refuses the token exchange too, not only the steady state', async () => {
    // Otherwise a stale watchUrl out of history would mint itself a fresh
    // cookie and start the twelve hours over.
    const res = fakeRes();
    await build(fakeGrants()).gate(
      `/session/kid1/observe/?token=${observeUrlToken('kid1')}`,
      undefined,
      undefined,
      undefined,
      res as never,
    );
    expect(res.statusCode).toBe(401);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('caps the observe cookie at the grant, not at the session cookie’s twelve hours', async () => {
    const res = fakeRes();
    await build(fakeGrants({ 'kid1:admin1': Date.now() + 90_000 })).gate(
      `/session/kid1/observe/?token=${observeUrlToken('kid1')}`,
      undefined,
      undefined,
      undefined,
      res as never,
    );
    const age = maxAge(res.headers['set-cookie']!);
    expect(age).toBeGreaterThan(0);
    expect(age).toBeLessThanOrEqual(90);
  });

  it('names the observer in the cookie, so the next request is checked against their hold', async () => {
    const res = fakeRes();
    await build(fakeGrants({ 'kid1:admin1': Date.now() + 90_000 })).gate(
      `/session/kid1/observe/?token=${observeUrlToken('kid1')}`,
      undefined,
      undefined,
      undefined,
      res as never,
    );
    const value = /asha_session=([^;]+)/.exec(res.headers['set-cookie']!)![1]!;
    const decoded = jwt.verify<{ sub?: string; obs?: boolean }>(value, { secret: SECRET });
    expect(decoded).toMatchObject({ sub: 'admin1', obs: true });
  });

  it('lets the observe route through while the hold stands', async () => {
    const res = fakeRes();
    await build(fakeGrants({ 'kid1:admin1': Date.now() + 90_000 })).gate(
      '/session/kid1/observe/websockify',
      undefined,
      undefined,
      `${SESSION_COOKIE}=${observeCookieToken('kid1')}`,
      res as never,
    );
    expect(res.statusCode).toBe(204);
  });
});

/**
 * The write path pays none of it.
 *
 * A user reaching their own desktop must work exactly as it did — reload,
 * resume after a pause, and the audio route — because a regression here takes
 * every user offline rather than only stopping an observation.
 */
describe('SessionAuthController — a user’s own desktop is untouched by the grant check', () => {
  let jwt: JwtService;
  let grants: ReturnType<typeof fakeGrants>;
  let ctrl: SessionAuthController;
  const urlToken = (kasmId: string) => jwt.sign({ sid: 's1', kasmId }, { secret: SECRET, expiresIn: 120 });
  const cookieToken = (kasmId: string) =>
    jwt.sign({ kasmId, typ: 'sess-cookie' }, { secret: SECRET, expiresIn: 3600 });

  beforeEach(() => {
    jwt = new JwtService({});
    // Nobody is watching anything, and Redis would answer nothing either.
    grants = fakeGrants();
    ctrl = new SessionAuthController(jwt, env as never, grants as never);
  });

  it('never asks whether an observation is open', async () => {
    // The read is what would put a Redis outage between a user and their own
    // desktop, so the write path must not make it at all.
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
    expect(grants.asked).toEqual([]);
  });

  it('keeps the full session lifetime on the cookie it mints', async () => {
    const res = fakeRes();
    await ctrl.gate(`/session/kid1/?token=${urlToken('kid1')}`, undefined, undefined, undefined, res as never);
    expect(res.headers['set-cookie']).toContain('Max-Age=43200');
  });

  it('serves the audio route on the session cookie, as it always did', async () => {
    // Same router family, one segment along, and not an observe path — a gate
    // that mistook it for one would kill sound for every user.
    const res = fakeRes();
    await ctrl.gate('/session/kid1/audio', undefined, undefined, `${SESSION_COOKIE}=${cookieToken('kid1')}`, res as never);
    expect(res.statusCode).toBe(204);
  });
});
