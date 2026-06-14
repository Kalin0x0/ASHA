import jwt from 'jsonwebtoken';
import { proxyEnv } from './env.js';

export interface TokenPayload {
  sub: string;
  orgId: string;
  iat: number;
  exp: number;
  [key: string]: unknown;
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

/**
 * Verify a Chista access token (signed by the API with JWT_ACCESS_SECRET, shared
 * here as JWT_SECRET) and return its payload. The API's access tokens carry
 * `sub`/`orgId` (no explicit `type` claim), so we require those rather than a
 * token-type tag. Throws AuthError on failure.
 */
export function verifyToken(token: string): TokenPayload {
  try {
    const payload = jwt.verify(token, proxyEnv.jwtSecret) as TokenPayload;
    if (!payload.sub || !payload.orgId) throw new AuthError('Token missing sub/orgId');
    return payload;
  } catch (e) {
    if (e instanceof AuthError) throw e;
    throw new AuthError(`Invalid token: ${(e as Error).message}`);
  }
}
