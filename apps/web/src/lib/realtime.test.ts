import type { WsServerEvent } from '@asha/events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { io, sockets } = vi.hoisted(() => {
  interface FakeSocket {
    connected: boolean;
    auth: (cb: (data: object) => void) => void;
    handlers: Map<string, (arg: unknown) => void>;
    on: (event: string, fn: (arg: unknown) => void) => void;
    connect: () => void;
    close: () => void;
    removeAllListeners: () => void;
  }
  const sockets: FakeSocket[] = [];
  const io = vi.fn((_url: string, opts: { auth: FakeSocket['auth'] }) => {
    const socket: FakeSocket = {
      connected: false,
      auth: opts.auth,
      handlers: new Map(),
      on(event, fn) {
        this.handlers.set(event, fn);
      },
      connect: vi.fn(),
      close: vi.fn(),
      removeAllListeners: vi.fn(),
    };
    sockets.push(socket);
    return socket;
  });
  return { io, sockets };
});

vi.mock('socket.io-client', () => ({ io }));

import { clearAuth, setTokens } from '@/lib/api/auth-store';
import { connectRealtime } from './realtime';

const tokens = (accessToken: string) => ({
  accessToken,
  refreshToken: 'r',
  expiresIn: 900,
  tokenType: 'Bearer',
});

/** What the socket would actually present on its next connection attempt. */
function presentedToken(socket: (typeof sockets)[number]): string {
  let sent: { token?: string } = {};
  socket.auth((data) => {
    sent = data as { token?: string };
  });
  return sent.token ?? '';
}

/**
 * The access token lives fifteen minutes and the gateway hard-drops a socket
 * whose token no longer verifies — a disconnect socket.io does not retry. A
 * token read once at mount therefore left the socket dead for the rest of the
 * page, and the observed user's viewer lost the `session.observed` channel: they
 * were watched with no banner and no way to know.
 */
describe('connectRealtime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sockets.length = 0;
    clearAuth();
  });

  const connect = () =>
    connectRealtime({ onEvent: () => undefined, onStatus: () => undefined });

  it('opens nothing while there is no token', () => {
    const close = connect();
    expect(io).not.toHaveBeenCalled();
    close();
  });

  it('opens once the user signs in, rather than staying idle for the life of the page', () => {
    const close = connect();
    setTokens(tokens('first'));
    expect(io).toHaveBeenCalledTimes(1);
    close();
  });

  it('presents the current token on every connection attempt, not the one from mount', () => {
    setTokens(tokens('stale'));
    const close = connect();
    expect(presentedToken(sockets[0]!)).toBe('stale');
    setTokens(tokens('refreshed'));
    // socket.io re-runs the auth callback per attempt, so the reconnect after a
    // drop carries the refreshed token.
    expect(presentedToken(sockets[0]!)).toBe('refreshed');
    close();
  });

  it('reconnects a socket the gateway dropped once a refreshed token arrives', () => {
    setTokens(tokens('expired'));
    const close = connect();
    const socket = sockets[0]!;
    socket.handlers.get('disconnect')?.(undefined);
    socket.connected = false;
    setTokens(tokens('refreshed'));
    expect(socket.connect).toHaveBeenCalledTimes(1);
    close();
  });

  it('leaves a healthy socket alone when the token is refreshed under it', () => {
    setTokens(tokens('first'));
    const close = connect();
    const socket = sockets[0]!;
    socket.connected = true;
    setTokens(tokens('second'));
    expect(socket.connect).not.toHaveBeenCalled();
    expect(io).toHaveBeenCalledTimes(1);
    close();
  });

  it('does not churn the socket when the store is written without a new token', () => {
    setTokens(tokens('first'));
    const close = connect();
    setTokens(tokens('first'));
    expect(sockets[0]!.connect).not.toHaveBeenCalled();
    close();
  });

  it('stops listening to the auth store once torn down', () => {
    setTokens(tokens('first'));
    const close = connect();
    close();
    setTokens(tokens('second'));
    expect(sockets).toHaveLength(1);
    expect(sockets[0]!.close).toHaveBeenCalled();
  });

  it('passes gateway events straight to the caller', () => {
    setTokens(tokens('first'));
    const seen: WsServerEvent[] = [];
    const close = connectRealtime({ onEvent: (e) => seen.push(e), onStatus: () => undefined });
    const event = { type: 'session.observation', payload: { sessionId: 's1' } } as WsServerEvent;
    sockets[0]!.handlers.get('event')?.(event);
    expect(seen).toEqual([event]);
    close();
  });
});
