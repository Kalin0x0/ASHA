/**
 * Guacamole protocol handler for RDP and VNC sessions.
 *
 * Architecture:
 *   Browser (guacamole-common-js) ←ws→ Proxy ←guacd protocol→ guacd daemon
 *
 * `guacd` (the Guacamole Daemon, docker image `guacamole/guacd`) handles the
 * actual RDP/VNC negotiation. This handler performs the server-side guacd
 * handshake, then bridges the raw Guacamole instruction stream between the
 * browser WebSocket and guacd.
 *
 * Handshake (proxy ↔ guacd):
 *   1. proxy → guacd : select,<protocol>;
 *   2. guacd → proxy : args,<VERSION>,<param1>,<param2>,…;
 *   3. proxy → guacd : size,<w>,<h>,<dpi>;  audio;  video;  image;
 *   4. proxy → guacd : connect,<val for param1>,<val for param2>,…;
 *   After `connect`, everything is bridged verbatim.
 *
 * Connection parameters are filled from the session record (hostname, port,
 * username, password) keyed by the parameter names guacd advertises in `args`.
 */

import type { IncomingMessage } from 'node:http';
import net from 'node:net';
import { StringDecoder } from 'node:string_decoder';
import { createLogger } from '@chista/logger';
import type WebSocket from 'ws';
import type { SessionRecord } from '../session-store.js';
import { encodeInstruction, GuacamoleParser } from './guac-protocol.js';

const log = createLogger('proxy:guacamole');

const GUACD_HOST = process.env.GUACD_HOST ?? 'localhost';
const GUACD_PORT = Number(process.env.GUACD_PORT ?? 4822);
const DEFAULT_WIDTH = Number(process.env.GUAC_DEFAULT_WIDTH ?? 1280);
const DEFAULT_HEIGHT = Number(process.env.GUAC_DEFAULT_HEIGHT ?? 720);
const DEFAULT_DPI = 96;

/** Build the value for each parameter guacd asks for, from the session record. */
function resolveParam(name: string, session: SessionRecord): string {
  const protocol = session.protocol === 'RDP' ? 'rdp' : 'vnc';
  const host = session.internalHost ?? 'localhost';
  const port = String(session.internalPort ?? (protocol === 'rdp' ? 3389 : 5900));

  switch (name) {
    case 'hostname':
      return host;
    case 'port':
      return port;
    case 'username':
      return session.rdpUser ?? '';
    case 'password':
      return session.rdpPassword ?? '';
    case 'ignore-cert':
      return 'true'; // accept Windows' self-signed RDP cert
    case 'disable-auth':
      // MUST be false: NLA/credentialled RDP needs guacd to actually send the
      // username/password. 'true' makes guacd skip auth → the server refuses
      // ("wrong security type"), which looks like a security-mode problem.
      return 'false';
    case 'security':
      return session.security ?? (protocol === 'rdp' ? 'any' : '');
    case 'width':
      return String(DEFAULT_WIDTH);
    case 'height':
      return String(DEFAULT_HEIGHT);
    case 'dpi':
      return String(DEFAULT_DPI);
    // RemoteApp / RDS published-application launch (RDP only).
    case 'remote-app':
      return session.remoteApp ?? '';
    case 'remote-app-dir':
      return session.remoteAppDir ?? '';
    case 'remote-app-args':
      return session.remoteAppArgs ?? '';
    default:
      return '';
  }
}

export function handleGuacamole(ws: WebSocket, _req: IncomingMessage, session: SessionRecord): void {
  const protocol = session.protocol === 'RDP' ? 'rdp' : 'vnc';
  const guacd = net.createConnection(GUACD_PORT, GUACD_HOST);
  // The browser's guacamole-common-js client drives the Guacamole handshake
  // itself (it negotiates its own display size + image codecs). We relay the
  // stream browser↔guacd verbatim and ONLY rewrite the client's `connect`
  // instruction to inject the server-side params (hostname/port/user/password/
  // security). A proxy-driven handshake left the browser's display state
  // inconsistent with guacd → the desktop rendered black (cursor-only).
  //
  // guacd → browser must be TEXT frames: guacamole-common-js's WebSocketTunnel
  // calls .indexOf on every message, so binary frames throw "i.indexOf is not a
  // function". StringDecoder reassembles UTF-8 split across TCP chunks.
  const guacdParser = new GuacamoleParser();
  const browserParser = new GuacamoleParser();
  const toBrowser = new StringDecoder('utf8');
  let version = 'VERSION_1_0_0';
  let paramNames: string[] = [];

  guacd.once('connect', () => {
    // The WebSocket-tunnel client does not send `select`; the proxy picks the
    // protocol here. guacd then replies with `args`.
    log.debug({ sessionId: session.sessionId, protocol }, 'guacd connected — select');
    guacd.write(encodeInstruction('select', protocol));
  });

  // guacd → browser: capture `args` (to fill the client's `connect`), forward
  // the whole stream to the browser as text frames.
  guacd.on('data', (chunk: Buffer) => {
    const text = toBrowser.write(chunk);
    for (const inst of guacdParser.push(text)) {
      if (inst[0] === 'args') {
        // args = [protocolVersion, ...paramNames]
        version = inst[1] ?? version;
        paramNames = inst.slice(2);
      }
    }
    if (ws.readyState === ws.OPEN) ws.send(text);
  });

  guacd.on('error', (e) => {
    log.warn({ err: e.message, sessionId: session.sessionId }, 'guacd error');
    if (ws.readyState === ws.OPEN) ws.close(1011, `guacd error: ${e.message}`);
  });

  guacd.on('close', () => {
    if (ws.readyState === ws.OPEN) ws.close(1000);
  });

  // Browser → guacd: relay verbatim, but drop the client's `select` (we sent
  // ours) and replace its `connect` values with the resolved server params.
  ws.on('message', (data) => {
    if (!guacd.writable) return;
    const text = Buffer.isBuffer(data)
      ? data.toString('utf8')
      : typeof data === 'string'
        ? data
        : Array.isArray(data)
          ? Buffer.concat(data).toString('utf8')
          : Buffer.from(data as ArrayBuffer).toString('utf8');

    let out = '';
    for (const inst of browserParser.push(text)) {
      const opcode = inst[0];
      if (opcode === 'select') {
        continue; // the proxy already selected the protocol
      }
      if (opcode === 'connect') {
        // Inject the server params: connect must echo the protocol version then
        // a value for every name guacd advertised in `args`.
        const values = paramNames.map((name) => resolveParam(name, session));
        out += encodeInstruction('connect', version, ...values);
        log.info(
          { sessionId: session.sessionId, protocol, params: paramNames.length },
          'guacd handshake — injected server params into connect',
        );
      } else {
        out += encodeInstruction(...(inst as [string, ...string[]]));
      }
    }
    if (out && guacd.writable) guacd.write(out);
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
      `guacd bridge active — needs guacd at ${GUACD_HOST}:${GUACD_PORT} (GUACD_HOST / GUACD_PORT).`,
    );
  }
}
