import { describe, expect, it } from 'vitest';
import type { TokenPayload } from './auth.js';
import { resolveStreamMode } from './proxy.js';
import type { SessionRecord } from './session-store.js';

const token = (over: Partial<TokenPayload> = {}): TokenPayload => ({
  sub: 'u1',
  orgId: 'o1',
  iat: 0,
  exp: 0,
  ...over,
});

const owned = { userId: 'u1' } as Pick<SessionRecord, 'userId'>;
const someoneElses = { userId: 'u2' } as Pick<SessionRecord, 'userId'>;
const unclaimed = { userId: null } as Pick<SessionRecord, 'userId'>;

describe('resolveStreamMode — who may open a session stream', () => {
  it('gives the session owner full input', () => {
    expect(resolveStreamMode(owned, token(), 'k1')).toBe('control');
  });

  it('refuses a colleague from the same org', () => {
    // The org match alone used to be the whole check: anyone who knew a kasmId
    // could stream — and type into — any desktop in their company.
    expect(resolveStreamMode(someoneElses, token(), 'k1')).toBeNull();
  });

  it('lets the launcher through on a staged session that has no owner yet', () => {
    expect(resolveStreamMode(unclaimed, token(), 'k1')).toBe('control');
  });

  it('gives a watch token for this session view-only', () => {
    expect(resolveStreamMode(someoneElses, token({ mode: 'view', kasmId: 'k1' }), 'k1')).toBe('view');
  });

  it('refuses a watch token minted for a different session', () => {
    // The token is bound to one kasmId, so it cannot be replayed against the
    // next desktop the observer happens to know the id of.
    expect(resolveStreamMode(someoneElses, token({ mode: 'view', kasmId: 'k2' }), 'k1')).toBeNull();
  });

  it('refuses a watch token that names no session at all', () => {
    expect(resolveStreamMode(someoneElses, token({ mode: 'view' }), 'k1')).toBeNull();
  });

  it('never lets a watch token collect input rights from an unowned session', () => {
    // Both the owner branch and the unclaimed-session branch grant control, so
    // a view token has to be answered before either of them.
    expect(resolveStreamMode(unclaimed, token({ mode: 'view', kasmId: 'k1' }), 'k1')).toBe('view');
    expect(resolveStreamMode(owned, token({ mode: 'view', kasmId: 'k1' }), 'k1')).toBe('view');
  });
});
