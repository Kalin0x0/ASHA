/**
 * The decision half of the session-stream forward-auth gate, as a pure function.
 *
 * Traefik calls the API once per request that hits a session router. Everything
 * that decides allow/redirect/deny is here, with no framework and no I/O, so the
 * rules can be exercised directly — the surrounding controller only verifies the
 * JWT and turns the verdict into a response.
 *
 * ## Why a redirect rather than "verify the token every time"
 *
 * The token exists exactly once, in the query string of the FIRST navigation.
 * The noVNC client then opens its stream socket at `/session/<id>/websockify`
 * and pulls a dozen assets, none of which carry it — so a gate that demanded the
 * token on every request would reject everything after the first frame.
 *
 * The token is therefore traded once for a cookie. That has to happen on a
 * NON-2xx response: Traefik copies an auth server's 2xx headers onto the request
 * it forwards upstream, and only a non-2xx response is returned to the browser
 * verbatim. A 302 is both the mechanism and the right semantics — and it strips
 * the bearer token out of the URL, so it stops being in history, logs and
 * `Referer` for the rest of the session.
 */

/** What the gate wants done with one request. */
export type SessionAuthVerdict =
  /** Already carries a valid cookie — let Traefik forward it upstream. */
  | { action: 'allow'; kasmId: string }
  /**
   * Carries a valid one-shot token. Set the cookie and bounce the browser to the
   * same URL without it. `location` is deliberately relative: an absolute URL
   * built from a request header is an open redirect waiting to happen.
   */
  | { action: 'exchange'; kasmId: string; location: string }
  /** No proof of any kind. */
  | { action: 'deny'; reason: string };

export interface SessionAuthRequest {
  /** Traefik's `X-Forwarded-Uri`: path + query of the request being gated. */
  forwardedUri: string | undefined;
  /** Traefik's `X-Forwarded-Host`, used to read the kasmId in subdomain mode. */
  forwardedHost: string | undefined;
  /** Raw `Cookie` header, forwarded with the original request. */
  cookieHeader: string | undefined;
  /** Verifies a token and returns its kasmId, or null. Injected so this stays pure. */
  readCookieToken: (jwt: string) => string | null;
  readUrlToken: (jwt: string) => string | null;
}

/** Cookie name. Scoped by Path to one session, so two sessions never collide. */
export const SESSION_COOKIE = 'asha_session';

/** `/session/<kasmId>/...` → the id. Anchored, so a later segment cannot spoof it. */
export function kasmIdFromPath(path: string): string | null {
  return /^\/session\/([A-Za-z0-9_-]+)(?:\/|$)/.exec(path)?.[1] ?? null;
}

/** `<kasmId>.sessions.<domain>` → the id, for subdomain routing mode. */
export function kasmIdFromHost(host: string): string | null {
  return /^([A-Za-z0-9_-]+)\.sessions\./.exec(host.split(':')[0] ?? '')?.[1] ?? null;
}

/** Reads one cookie out of a raw `Cookie` header without pulling in a parser. */
export function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

/** The Path a session's cookie is scoped to — never wider than the session. */
export function cookiePath(kasmId: string, mode: 'path' | 'subdomain'): string {
  return mode === 'subdomain' ? '/' : `/session/${kasmId}`;
}

export function decideSessionAuth(req: SessionAuthRequest): SessionAuthVerdict {
  const raw = req.forwardedUri ?? '';
  if (!raw.startsWith('/')) return { action: 'deny', reason: 'no forwarded uri' };

  const qIndex = raw.indexOf('?');
  const path = qIndex < 0 ? raw : raw.slice(0, qIndex);
  const query = new URLSearchParams(qIndex < 0 ? '' : raw.slice(qIndex + 1));

  // Path mode first: the prefix is the authoritative statement of which session
  // is being asked for. Subdomain mode has no prefix, so fall back to the host.
  const kasmId = kasmIdFromPath(path) ?? kasmIdFromHost(req.forwardedHost ?? '');
  if (!kasmId) return { action: 'deny', reason: 'no session in path or host' };

  // The cookie is checked FIRST: it is the steady state, and every request after
  // the first has one and no token.
  const cookie = readCookie(req.cookieHeader, SESSION_COOKIE);
  if (cookie) {
    const forSession = req.readCookieToken(cookie);
    // A cookie is Path-scoped, but a scope is not a claim. Compare anyway, so a
    // cookie minted for another session can never open this one.
    if (forSession === kasmId) return { action: 'allow', kasmId };
  }

  const token = query.get('token');
  if (token) {
    const forSession = req.readUrlToken(token);
    if (forSession === kasmId) {
      query.delete('token');
      const rest = query.toString();
      return { action: 'exchange', kasmId, location: rest ? `${path}?${rest}` : path };
    }
    return { action: 'deny', reason: 'token does not match this session' };
  }

  return { action: 'deny', reason: cookie ? 'cookie does not match this session' : 'no token or cookie' };
}
