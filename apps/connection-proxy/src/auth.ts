import jwt from 'jsonwebtoken';
import { proxyEnv } from './env.js';

export interface TokenPayload {
  sub: string;
  orgId: string;
  role: string;
  type: 'access' | 'refresh';
  iat: number;
  exp: number;
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

/** Verify a JWT access token and return its payload. Throws AuthError on failure. */
export function verifyToken(token: string): TokenPayload {
  try {
    const payload = jwt.verify(token, proxyEnv.jwtSecret) as TokenPayload;
    if (payload.type !== 'access') throw new AuthError('Not an access token');
    return payload;
  } catch (e) {
    if (e instanceof AuthError) throw e;
    throw new AuthError(`Invalid token: ${(e as Error).message}`);
  }
}
