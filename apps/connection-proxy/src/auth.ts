import jwt from 'jsonwebtoken';
import { proxyEnv } from './env.js';

/** Input rights a verified token grants over a session's stream. */
export type StreamMode = 'control' | 'view';

/**
 * The `typ` an observation watch token carries. The API signs watch tokens with
 * the same secret it signs access tokens with — this process holds no other —
 * so the marker is what separates "may watch one session, read-only" from "is a
 * user of the API". Mirrored in the API's ObservationService.
 */
const WATCH_TOKEN_TYPE = 'watch';

export interface TokenPayload {
  sub: string;
  orgId: string;
  iat: number;
  exp: number;
  /**
   * Watch-token claims. The API mints these for one session and one observer
   * after the RBAC/audit path, so they are bound to a single kasmId and never
   * carry input rights.
   */
  typ?: string;
  kasmId?: string;
  mode?: StreamMode;
  [key: string]: unknown;
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

/**
 * Verify a Asha token (signed by the API with JWT_ACCESS_SECRET, shared here as
 * JWT_SECRET) and return its payload. Access tokens carry `sub`/`orgId` and no
 * type; a watch token additionally names itself, and only such a token may
 * carry the claims that buy a view-only stream. Throws AuthError on failure.
 */
export function verifyToken(token: string): TokenPayload {
  try {
    const payload = jwt.verify(token, proxyEnv.jwtSecret) as TokenPayload;
    if (!payload.sub || !payload.orgId) throw new AuthError('Token missing sub/orgId');
    assertTokenType(payload);
    return payload;
  } catch (e) {
    if (e instanceof AuthError) throw e;
    throw new AuthError(`Invalid token: ${(e as Error).message}`);
  }
}

/**
 * View rights come from a watch token and from nothing else.
 *
 * `mode`/`kasmId` are the only claims that open the view branch downstream, so
 * they are refused unless the token says outright that it is a watch token: an
 * ordinary access token can then never reach that branch, whatever it carries,
 * and a watch token stripped of a claim is rejected rather than quietly
 * downgraded into a control token.
 */
function assertTokenType(payload: TokenPayload): void {
  if (payload.typ === WATCH_TOKEN_TYPE) {
    if (payload.mode !== 'view' || !payload.kasmId) {
      throw new AuthError('Watch token names no session to view');
    }
    return;
  }
  if (payload.typ !== undefined) throw new AuthError(`Token is not for this service: ${payload.typ}`);
  if (payload.mode !== undefined || payload.kasmId !== undefined) {
    throw new AuthError('Stream claims on a token that is not a watch token');
  }
}
