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

/**
 * Length of the leading prefix of `s` that consists ONLY of complete Guacamole
 * instructions (each terminated by ';'). Uses the same length-prefixed scan as
 * guacamole-common-js's own tunnel parser.
 *
 * Why this exists: guacamole-common-js's `WebSocketTunnel.onmessage` parses each
 * WebSocket message independently and does NOT buffer a partial instruction
 * across messages. If the proxy forwards one WS frame per raw guacd TCP chunk,
 * large desktop `img`/`blob` instructions (which span several TCP segments) get
 * split mid-instruction across frames and the browser silently drops them →
 * black desktop, cursor-only. So we only ever emit on instruction boundaries.
 */
function completeInstructionsLength(s: string): number {
  let consumed = 0;
  let i = 0;
  while (i < s.length) {
    let j = i;
    let complete = false;
    for (;;) {
      const dot = s.indexOf('.', j);
      if (dot === -1) break; // length prefix not fully here yet
      const len = Number(s.slice(j, dot));
      if (!Number.isFinite(len)) break;
      const valueEnd = dot + 1 + len;
      if (s.length < valueEnd + 1) break; // value + separator not fully here yet
      const sep = s[valueEnd];
      j = valueEnd + 1;
      if (sep === ';') {
        complete = true;
        break;
      }
      if (sep !== ',') break; // malformed — stop here, wait for more
    }
    if (!complete) break;
    consumed = j;
    i = j;
  }
  return consumed;
}

export function handleGuacamole(ws: WebSocket, _req: IncomingMessage, session: SessionRecord): void {
  const protocol = session.protocol === 'RDP' ? 'rdp' : 'vnc';
  const guacd = net.createConnection(GUACD_PORT, GUACD_HOST);
  const parser = new GuacamoleParser();
  // guacd → browser must be TEXT frames: guacamole-common-js's WebSocketTunnel
  // calls .indexOf on every message, so binary frames throw "i.indexOf is not a
  // function". StringDecoder reassembles UTF-8 split across TCP chunks.
  const toBrowser = new StringDecoder('utf8');

  // Handshake state: until `connected`, the proxy interprets guacd's
  // instructions; afterwards it bridges the stream to the browser.
  let connected = false;
  // Decoded guacd output not yet forwarded — holds a trailing PARTIAL instruction
  // until it completes, so every ws.send() carries only whole instructions.
  let pendingOut = '';

  guacd.once('connect', () => {
    log.debug({ sessionId: session.sessionId, protocol }, 'guacd connected — starting handshake');
    guacd.write(encodeInstruction('select', protocol));
  });

  guacd.on('data', (chunk: Buffer) => {
    // StringDecoder reassembles UTF-8 that may be split across TCP chunks.
    const text = toBrowser.write(chunk);

    if (connected) {
      // Past the handshake — bridge to the browser, but ONLY ever send whole
      // Guacamole instructions per WebSocket frame. guacamole-common-js's
      // tunnel does not buffer a partial instruction across frames, so a split
      // large img/blob would be silently dropped (black desktop). Buffer the
      // tail until it completes.
      pendingOut += text;
      const n = completeInstructionsLength(pendingOut);
      if (n > 0) {
        const frame = pendingOut.slice(0, n);
        pendingOut = pendingOut.slice(n);
        if (ws.readyState === ws.OPEN) ws.send(frame);
      }
      return;
    }

    // During the handshake, parse instructions to find `args`.
    for (const inst of parser.push(text)) {
      const [opcode, ...args] = inst;
      if (opcode === 'args') {
        // args = [protocolVersion, ...paramNames]
        const version = args[0] ?? 'VERSION_1_0_0';
        const paramNames = args.slice(1);
        const values = paramNames.map((name) => resolveParam(name, session));

        guacd.write(encodeInstruction('size', String(DEFAULT_WIDTH), String(DEFAULT_HEIGHT), String(DEFAULT_DPI)));
        // Declare the image/audio mimetypes guacamole-common-js can decode.
        // CRITICAL: an empty `image` tells guacd the client supports NO image
        // formats, so guacd can't encode the desktop framebuffer → black screen
        // (only the cursor, which uses a separate channel). The browser supports
        // PNG/JPEG/WebP, so advertise them.
        guacd.write(encodeInstruction('audio', 'audio/L8', 'audio/L16'));
        guacd.write(encodeInstruction('video'));
        guacd.write(encodeInstruction('image', 'image/jpeg', 'image/png', 'image/webp'));
        // The `connect` reply must echo a value for EVERY element guacd sent in
        // `args` — starting with the protocol version — or guacd rejects with
        // "Client did not return the expected number of arguments."
        guacd.write(encodeInstruction('connect', version, ...values));

        connected = true;
        log.info(
          { sessionId: session.sessionId, protocol, params: paramNames.length },
          'guacd handshake complete — bridging',
        );
        // Any bytes guacd already buffered past `args` will arrive in the next
        // data event and be forwarded (connected is now true).
        break;
      }
    }
  });

  guacd.on('error', (e) => {
    log.warn({ err: e.message, sessionId: session.sessionId }, 'guacd error');
    if (ws.readyState === ws.OPEN) ws.close(1011, `guacd error: ${e.message}`);
  });

  guacd.on('close', () => {
    if (ws.readyState === ws.OPEN) ws.close(1000);
  });

  // Browser → guacd: the PROXY drives the guacd handshake (it injects the
  // server-side RDP params), so we swallow the browser client's own handshake
  // (select/size/connect) until `connected`. After that the browser's frames
  // (key/mouse/clipboard) are written through verbatim.
  ws.on('message', (data) => {
    if (!connected || !guacd.writable) return;
    if (Buffer.isBuffer(data)) {
      guacd.write(data);
    } else if (typeof data === 'string') {
      guacd.write(Buffer.from(data, 'utf8'));
    } else if (data instanceof ArrayBuffer) {
      guacd.write(Buffer.from(data));
    } else if (Array.isArray(data)) {
      guacd.write(Buffer.concat(data));
    }
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
