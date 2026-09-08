import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import { AuthError, verifyToken } from './auth.js';
import { proxyEnv } from './env.js';

/** Sign with the same secret the proxy verifies with, so only the claims vary. */
const sign = (payload: Record<string, unknown>) =>
  jwt.sign(payload, proxyEnv.jwtSecret, { expiresIn: 120 });

const ACCESS = { sub: 'u1', orgId: 'o1', email: 'u@x.io', isSystemAdmin: false };
const WATCH = { sub: 'admin1', orgId: 'o1', kasmId: 'k1', mode: 'view', typ: 'watch' };

/**
 * The view branch downstream is opened by `mode`/`kasmId` alone, and both the
 * API and this process verify with the same secret — so without a marker every
 * access token was one forged claim away from being a watch token, and every
 * watch token was a full API credential travelling in a URL.
 */
describe('verifyToken — what a token is allowed to be', () => {
  it('accepts an ordinary access token', () => {
    const payload = verifyToken(sign(ACCESS));
    expect(payload.sub).toBe('u1');
    expect(payload.mode).toBeUndefined();
  });

  it('accepts a watch token that names itself and the session it may view', () => {
    const payload = verifyToken(sign(WATCH));
    expect(payload).toMatchObject({ mode: 'view', kasmId: 'k1', typ: 'watch' });
  });

  it('refuses view claims on a token that is not a watch token', () => {
    // Only the API mints watch tokens, after the permission check, the notice
    // and the audit entry. A token carrying the claims without the marker never
    // went through any of that.
    expect(() => verifyToken(sign({ ...ACCESS, mode: 'view', kasmId: 'k1' }))).toThrow(AuthError);
  });

  it('refuses a watch token stripped of the session it was minted for', () => {
    expect(() => verifyToken(sign({ ...WATCH, kasmId: undefined }))).toThrow(/names no session/);
  });

  it('refuses a watch token whose mode was changed to control', () => {
    expect(() => verifyToken(sign({ ...WATCH, mode: 'control' }))).toThrow(/names no session/);
  });

  it('refuses a token minted for some other service', () => {
    expect(() => verifyToken(sign({ ...ACCESS, typ: 'stream' }))).toThrow(/not for this service/);
  });

  it('still refuses a token signed with the wrong secret', () => {
    const forged = jwt.sign(WATCH, 'not-the-proxy-secret', { expiresIn: 120 });
    expect(() => verifyToken(forged)).toThrow(AuthError);
  });

  it('still refuses a token with no sub/orgId', () => {
    expect(() => verifyToken(sign({ kasmId: 'k1' }))).toThrow(/missing sub\/orgId/);
  });
});
