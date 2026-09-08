'use client';

import type { SessionObservedEvent, WsServerEvent } from '@asha/events';
import { useEffect, useRef, useState } from 'react';
import { type Socket, io } from 'socket.io-client';
import { getAccessToken, subscribeAuth } from '@/lib/api/auth-store';
import { WS_URL, isLive } from '@/lib/api/mode';

/**
 * The app's one WebSocket client. The API gateway lives on the `/ws` namespace
 * and pushes every realtime update as a single `event` message carrying a
 * discriminated `WsServerEvent`, so one listener covers all of them.
 *
 * The access token goes in the handshake `auth`, never the query: the gateway
 * derives the org room from the verified payload, and a client-supplied org id
 * would let anyone join anyone's room.
 */
export type RealtimeStatus = 'idle' | 'connecting' | 'open' | 'closed';

interface RealtimeOptions {
  /** Also join `session:<id>`, for a viewer that needs news about its own desktop. */
  sessionId?: string;
  /** False leaves the socket unopened (a page that has nothing to listen for yet). */
  enabled?: boolean;
}

export function useRealtimeEvents(
  onEvent: (event: WsServerEvent) => void,
  { sessionId, enabled = true }: RealtimeOptions = {},
): RealtimeStatus {
  const [status, setStatus] = useState<RealtimeStatus>('idle');
  // The handler is almost always a fresh closure; keeping it in a ref stops
  // every render from tearing the socket down and reconnecting.
  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => {
    // Mock mode has no gateway.
    if (!isLive || !enabled) return;
    return connectRealtime({
      sessionId,
      onEvent: (event) => handler.current(event),
      onStatus: setStatus,
    });
  }, [sessionId, enabled]);

  return status;
}

interface RealtimeConnection {
  sessionId?: string;
  onEvent: (event: WsServerEvent) => void;
  onStatus: (status: RealtimeStatus) => void;
}

/**
 * Open the gateway socket and keep it open across a token refresh. Returns the
 * teardown.
 *
 * An access token lives fifteen minutes, and the gateway hard-drops a socket
 * whose token no longer verifies — a disconnect socket.io deliberately does not
 * retry. Reading the token once and handing it over as a fixed object therefore
 * left the socket dead for the rest of the page after the first drop past that
 * window: survivable on the wall, which also polls, but the observed user's
 * viewer lost `session.observed` and was then watched with no banner.
 *
 * So the credentials are a callback — socket.io evaluates it per connection
 * attempt, so a reconnect presents the current token rather than the one that
 * happened to be in the store at mount — and a new token in the store re-opens
 * a socket the gateway dropped. The same subscription starts the socket for a
 * page that mounted before the user was signed in, which used to return here
 * silently and never retry.
 */
export function connectRealtime({ sessionId, onEvent, onStatus }: RealtimeConnection): () => void {
  let socket: Socket | null = null;
  // What the live socket was opened with, so an unchanged token (any other
  // write to the auth store) does not churn a healthy connection.
  let presented: string | null = null;

  const open = (token: string) => {
    presented = token;
    onStatus('connecting');
    socket = io(`${WS_URL}/ws`, {
      auth: (cb) => cb({ token: getAccessToken() ?? '', ...(sessionId ? { sessionId } : {}) }),
      reconnectionDelayMax: 10_000,
    });
    socket.on('connect', () => onStatus('open'));
    socket.on('disconnect', () => onStatus('closed'));
    socket.on('connect_error', () => onStatus('closed'));
    socket.on('event', (event: WsServerEvent) => onEvent(event));
  };

  const initial = getAccessToken();
  if (initial) open(initial);

  const unsubscribe = subscribeAuth(() => {
    const fresh = getAccessToken();
    if (!fresh || fresh === presented) return;
    if (!socket) {
      open(fresh);
      return;
    }
    presented = fresh;
    // A connected socket keeps running: it is already authenticated, and the
    // callback above will hand over this token if it ever has to reconnect.
    if (!socket.connected) socket.connect();
  });

  return () => {
    unsubscribe();
    socket?.removeAllListeners();
    socket?.close();
  };
}

/**
 * The observation notice for one session. The API emits `session.observed` when
 * an administrator starts watching and again with `active: false` when the last
 * one leaves, so the viewer only has to mirror the latest event.
 */
export function useSessionObserved(sessionId: string | undefined): SessionObservedEvent | null {
  const [observed, setObserved] = useState<SessionObservedEvent | null>(null);

  useRealtimeEvents(
    (event) => {
      if (event.type !== 'session.observed' || event.payload.sessionId !== sessionId) return;
      setObserved(event.payload.active ? event.payload : null);
    },
    { sessionId, enabled: Boolean(sessionId) },
  );

  return observed;
}
