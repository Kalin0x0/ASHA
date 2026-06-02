/**
 * SSH-over-WebSocket handler.
 *
 * Architecture:
 *   Browser (xterm.js + WebSocket) ←ws→ Proxy ←ssh2→ SSH server in container
 *
 * The proxy acts as an SSH client. It reads the container's SSH credentials
 * (host, port, user, key/password) from the session record stored in Redis by
 * the agent, then proxies the raw PTY stream to the browser WebSocket in a
 * format that xterm.js understands: plain UTF-8 text + JSON control frames.
 *
 * Phase 2 TODO:
 *   - Add ssh2 dependency and real SSH client implementation
 *   - Store per-session SSH connection params in Redis (set by agent)
 *   - Implement terminal resize via JSON control frames:
 *     { "type": "resize", "cols": 220, "rows": 50 }
 *   - Handle key-based auth: agent generates an ephemeral keypair per session
 *     and passes the public key as a Docker run argument
 */

import type { IncomingMessage } from 'node:http';
import { createLogger } from '@chista/logger';
import type WebSocket from 'ws';
import type { SessionRecord } from '../session-store.js';

const log = createLogger('proxy:ssh');

export function handleSSH(ws: WebSocket, _req: IncomingMessage, session: SessionRecord): void {
  log.info({ sessionId: session.sessionId }, 'SSH handler stub — ssh2 integration pending');

  // Send a placeholder terminal welcome message so the browser gets feedback.
  ws.send(
    '\r\n\x1b[33m[Chista]\x1b[0m SSH bridge not yet implemented.\r\n' +
    `Session: ${session.sessionId}\r\n` +
    'This placeholder will be replaced by the ssh2 integration in Phase 2.\r\n\r\n',
  );

  ws.on('message', () => {
    ws.send('\r\n\x1b[31mSSH bridge not yet implemented.\x1b[0m\r\n');
  });

  ws.on('close', () => log.debug({ sessionId: session.sessionId }, 'SSH client disconnected'));
}
