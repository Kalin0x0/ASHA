/**
 * Guacamole protocol handler for RDP and VNC sessions.
 *
 * Architecture:
 *   Browser (guacamole-common-js) ←ws→ Proxy ←guacd protocol→ guacd daemon
 *
 * `guacd` (the Guacamole Daemon) is a separate process that handles the
 * actual RDP/VNC negotiation. This handler bridges the browser WebSocket
 * to guacd using the Guacamole instruction protocol.
 *
 * Phase 2 TODO:
 *   - Spawn / discover guacd (docker image: guacamole/guacd)
 *   - Pipe the WebSocket frames to a TCP socket connected to guacd
 *   - Add the guacd connection token to the ProvisionCommand so the agent
 *     can set up the guacd connection parameters in Redis
 *   - Integrate `guacamole-lite` npm package as the WebSocket ↔ guacd bridge
 */

import type { IncomingMessage } from 'node:http';
import net from 'node:net';
import { createLogger } from '@chista/logger';
import type WebSocket from 'ws';
import { proxyEnv } from '../env.js';
import type { SessionRecord } from '../session-store.js';

const log = createLogger('proxy:guacamole');

const GUACD_HOST = process.env.GUACD_HOST ?? 'localhost';
const GUACD_PORT = Number(process.env.GUACD_PORT ?? 4822);

function buildGuacdHandshake(session: SessionRecord): string {
  const protocol = session.protocol === 'RDP' ? 'rdp' : 'vnc';
  const host = session.internalHost ?? 'localhost';
  const port = session.internalPort ?? (protocol === 'rdp' ? 3389 : 5900);

  // Guacamole instruction format: <length>.<value>,<length>.<value>;
  const args = [
    `${protocol.length}.${protocol}`,
    `${String(host).length}.${host}`,
    `${String(port).length}.${port}`,
  ].join(',');
  return `${args.length}.select,${args};`;
}

export function handleGuacamole(ws: WebSocket, _req: IncomingMessage, session: SessionRecord): void {
  const guacd = net.createConnection(GUACD_PORT, GUACD_HOST);
  let open = false;

  guacd.once('connect', () => {
    open = true;
    log.debug({ sessionId: session.sessionId, protocol: session.protocol }, 'guacd connected');
    guacd.write(buildGuacdHandshake(session));
  });

  guacd.on('data', (chunk) => {
    if (ws.readyState === ws.OPEN) ws.send(chunk);
  });

  guacd.on('error', (e) => {
    log.warn({ err: e.message, sessionId: session.sessionId }, 'guacd error');
    ws.close(1011, `guacd error: ${e.message}`);
  });

  guacd.on('close', () => {
    if (ws.readyState === ws.OPEN) ws.close(1000);
  });

  ws.on('message', (data) => {
    if (open && guacd.writable) guacd.write(data as Buffer);
  });

  ws.on('close', () => {
    if (!guacd.destroyed) guacd.destroy();
  });

  ws.on('error', () => {
    if (!guacd.destroyed) guacd.destroy();
  });

  if (process.env.NODE_ENV !== 'production') {
    log.info(
      { guacdHost: GUACD_HOST, guacdPort: GUACD_PORT, sessionId: session.sessionId },
      `guacd bridge not yet fully wired — needs guacd at ${GUACD_HOST}:${GUACD_PORT}. Configured via GUACD_HOST / GUACD_PORT env vars.`,
    );
  }

  // Keep the env ref to satisfy import lint
  void proxyEnv;
}
