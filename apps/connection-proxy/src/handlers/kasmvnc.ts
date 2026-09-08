/**
 * KasmVNC handler: KasmVNC sessions expose their own full browser client on
 * port 6901. The browser embeds it via an <iframe> pointing directly at the
 * Traefik-proxied URL — no WebSocket bridging needed from the proxy.
 *
 * This handler is included for completeness and as a type-safe guard: if the
 * proxy receives a WebSocket upgrade for a KasmVNC session it means the
 * routing is misconfigured. We close the connection with a descriptive error.
 */

import type { IncomingMessage } from 'node:http';
import type WebSocket from 'ws';
import type { SessionRecord } from '../session-store.js';

export function handleKasmVNC(ws: WebSocket, _req: IncomingMessage, session: SessionRecord): void {
  ws.close(
    4000,
    JSON.stringify({
      error: 'WRONG_HANDLER',
      message: `Session ${session.kasmId} is a KasmVNC session — connect directly via the session iframe URL, not the connection proxy.`,
    }),
  );
}
