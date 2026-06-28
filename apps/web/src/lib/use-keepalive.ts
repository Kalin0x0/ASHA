'use client';

import { useEffect } from 'react';
import { sessionKeepalive } from '@/lib/api/endpoints';
import { isLive } from '@/lib/api/mode';

const KEEPALIVE_INTERVAL_MS = 60_000;

/**
 * Keep an actively-used session alive. While `active`, POST
 * /sessions/:id/keepalive on an interval so the server-side idle reaper
 * (ASHA_SESSION_MAX_IDLE_MINUTES, default 120) never terminates a desktop the
 * user is actually using. Both the RDP/guac viewer (/connect) and the KasmVNC
 * viewer (/session) call this — previously NOTHING refreshed lastKeepaliveAt, so
 * any RDP or container session in use longer than the idle ceiling was reaped
 * mid-session. No-op in mock mode.
 */
export function useKeepalive(sessionId: string | undefined, active: boolean): void {
  useEffect(() => {
    if (!isLive || !active || !sessionId) return;
    const ping = () =>
      void sessionKeepalive(sessionId).catch(() => {
        /* transient failure — the next tick retries; a real outage surfaces via
           the viewer's own connection state, not here. */
      });
    ping(); // refresh immediately on connect so the clock resets right away
    const id = setInterval(ping, KEEPALIVE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [sessionId, active]);
}
