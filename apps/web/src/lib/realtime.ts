'use client';

import type { SessionObservedEvent, WsServerEvent } from '@asha/events';
import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { getAccessToken } from '@/lib/api/auth-store';
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
    // Mock mode has no gateway, and without a token the handshake is refused.
    if (!isLive || !enabled) return;
    const token = getAccessToken();
    if (!token) return;

    setStatus('connecting');
    const socket = io(`${WS_URL}/ws`, {
      auth: { token, ...(sessionId ? { sessionId } : {}) },
      reconnectionDelayMax: 10_000,
    });
    socket.on('connect', () => setStatus('open'));
    socket.on('disconnect', () => setStatus('closed'));
    socket.on('connect_error', () => setStatus('closed'));
    socket.on('event', (event: WsServerEvent) => handler.current(event));

    return () => {
      socket.removeAllListeners();
      socket.close();
    };
  }, [sessionId, enabled]);

  return status;
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
