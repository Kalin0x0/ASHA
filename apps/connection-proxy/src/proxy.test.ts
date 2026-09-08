import { EventEmitter } from 'node:events';
import type { IncomingMessage } from 'node:http';
import jwt from 'jsonwebtoken';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TokenPayload } from './auth.js';
import { proxyEnv } from './env.js';
import { bindViewToGrant, handleUpgrade, resolveStreamMode } from './proxy.js';
import type { SessionRecord, SessionStore, WatchRecordStore } from './session-store.js';

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

/**
 * The grant, not the socket, is what authorizes watching. These cases drive the
 * real upgrade path with a stand-in socket, because the defect only shows in
 * what happens AFTER the one-off token check: a stopped observation used to
 * keep streaming for the rest of the session.
 */

class FakeSocket extends EventEmitter {
  readonly OPEN = 1;
  readyState = 1;
  closeCode: number | null = null;
  closeReason = '';

  close(code = 1000, reason = ''): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.closeCode = code;
    this.closeReason = reason;
    this.emit('close');
  }
}

const SESSION = {
  sessionId: 's1',
  kasmId: 'k1',
  orgId: 'o1',
  userId: 'u2',
  protocol: 'KASMVNC',
  status: 'RUNNING',
} as unknown as SessionRecord;

/** `null` from isWatchActive is "Redis did not answer", not "nobody is watching". */
function fakeStore(watchActive: boolean | null) {
  return {
    get: vi.fn(async () => SESSION),
    isWatchActive: vi.fn(async () => watchActive),
  };
}

const upgrade = (store: ReturnType<typeof fakeStore>, claims: Record<string, unknown>) => {
  const ws = new FakeSocket();
  const token = jwt.sign(claims, proxyEnv.jwtSecret, { expiresIn: 120 });
  const req = { url: `/session/k1?token=${token}` } as IncomingMessage;
  return { ws, done: handleUpgrade(ws as never, req, store as unknown as SessionStore) };
};

/** What the API mints: a watch token names itself, its observer and its session. */
const watchClaims = { sub: 'u1', orgId: 'o1', kasmId: 'k1', mode: 'view', typ: 'watch' };

describe('a view socket lives no longer than the grant that opened it', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('refuses a watch token whose observation has already been stopped', async () => {
    const store = fakeStore(false);
    const { ws, done } = upgrade(store, watchClaims);
    await done;
    expect(ws.closeCode).toBe(4006);
  });

  it('lets the observer through while the watch record cannot be read', async () => {
    // Redis is down, not the observation: a hiccup must not end a live watch.
    const store = fakeStore(null);
    const { ws, done } = upgrade(store, watchClaims);
    await done;
    expect(store.isWatchActive).toHaveBeenCalledWith('k1');
    expect(ws.closeCode).not.toBe(4006);
    expect(ws.closeCode).not.toBe(4005);
  });

  it('does not consult the watch record for the session owner', async () => {
    const store = fakeStore(false);
    const { ws, done } = upgrade(store, { sub: 'u2', orgId: 'o1' });
    await done;
    expect(store.isWatchActive).not.toHaveBeenCalled();
    expect(ws.closeCode).not.toBe(4006);
  });

  it('closes the stream when the watch token expires', () => {
    vi.useFakeTimers();
    const ws = new FakeSocket();
    const store: WatchRecordStore = { isWatchActive: vi.fn(async () => true) };
    bindViewToGrant(ws as never, 'k1', Date.now() + 120_000, store);

    vi.advanceTimersByTime(119_000);
    expect(ws.closeCode).toBeNull();
    vi.advanceTimersByTime(2_000);
    expect(ws.closeCode).toBe(4005);
  });

  it('closes the stream once the observation is stopped', async () => {
    vi.useFakeTimers();
    const ws = new FakeSocket();
    const store: WatchRecordStore = { isWatchActive: vi.fn(async () => false) };
    bindViewToGrant(ws as never, 'k1', Date.now() + 120_000, store);

    await vi.advanceTimersByTimeAsync(6_000);
    expect(ws.closeCode).toBe(4006);
  });

  it('keeps the stream open while the watch record is unreadable', async () => {
    vi.useFakeTimers();
    const ws = new FakeSocket();
    const store: WatchRecordStore = { isWatchActive: vi.fn(async () => null) };
    bindViewToGrant(ws as never, 'k1', Date.now() + 120_000, store);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(ws.closeCode).toBeNull();
    expect(store.isWatchActive).toHaveBeenCalled();
  });

  it('stops re-reading the watch record once the socket is gone', async () => {
    vi.useFakeTimers();
    const ws = new FakeSocket();
    const store: WatchRecordStore = { isWatchActive: vi.fn(async () => true) };
    bindViewToGrant(ws as never, 'k1', Date.now() + 120_000, store);

    await vi.advanceTimersByTimeAsync(6_000);
    const reads = (store.isWatchActive as ReturnType<typeof vi.fn>).mock.calls.length;
    ws.close(1000);
    await vi.advanceTimersByTimeAsync(60_000);
    expect((store.isWatchActive as ReturnType<typeof vi.fn>).mock.calls.length).toBe(reads);
  });
});
