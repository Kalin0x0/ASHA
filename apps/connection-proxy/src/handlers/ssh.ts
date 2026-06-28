/**
 * SSH-over-WebSocket handler.
 *
 * Architecture:
 *   Browser (xterm.js + WebSocket) ←ws→ Proxy ←ssh2→ SSH server in container
 *
 * The proxy acts as an SSH client. It reads the container's SSH credentials
 * (host, port, user, key/password) from the session record stored in Redis by
 * the agent, then proxies the raw PTY stream to the browser WebSocket.
 *
 * Wire format (browser ↔ proxy):
 *   - Binary / plain string frames are raw terminal I/O (UTF-8), piped straight
 *     to and from the PTY.
 *   - JSON control frames (objects) are interpreted by the proxy, never sent to
 *     the shell:
 *       { "type": "resize", "cols": 220, "rows": 50 }
 */

import type { IncomingMessage } from 'node:http';
import { createLogger } from '@asha/logger';
import { Client, type ClientChannel } from 'ssh2';
import type WebSocket from 'ws';
import type { SessionRecord } from '../session-store.js';

const log = createLogger('proxy:ssh');

const DEFAULT_SSH_PORT = 22;
const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;

interface ResizeFrame {
  type: 'resize';
  cols: number;
  rows: number;
}

/** A control frame is a JSON object with a known `type`; anything else is raw input. */
function parseControlFrame(data: WebSocket.RawData, isBinary: boolean): ResizeFrame | null {
  if (isBinary) return null;
  const text = data.toString('utf8');
  // Cheap guard: only attempt JSON.parse for frames that look like an object.
  if (text.length === 0 || text[0] !== '{') return null;
  try {
    const obj = JSON.parse(text) as { type?: string; cols?: number; rows?: number };
    if (obj.type === 'resize' && typeof obj.cols === 'number' && typeof obj.rows === 'number') {
      return { type: 'resize', cols: obj.cols, rows: obj.rows };
    }
  } catch {
    // Not a control frame — fall through to raw input.
  }
  return null;
}

export function handleSSH(ws: WebSocket, _req: IncomingMessage, session: SessionRecord): void {
  const host = session.internalHost;
  const port = session.internalPort ?? DEFAULT_SSH_PORT;
  const username = session.sshUser ?? 'kasm-user';

  if (!host) {
    ws.send('\r\n\x1b[31m[Asha] SSH target not ready — no container host on record.\x1b[0m\r\n');
    ws.close(1011, 'ssh target not ready');
    return;
  }
  if (!session.sshPassword && !session.sshPrivateKey) {
    ws.send('\r\n\x1b[31m[Asha] SSH credentials missing for this session.\x1b[0m\r\n');
    ws.close(1011, 'ssh credentials missing');
    return;
  }

  const conn = new Client();
  let stream: ClientChannel | null = null;
  let cols = DEFAULT_COLS;
  let rows = DEFAULT_ROWS;

  const closeAll = (code = 1000, reason = ''): void => {
    if (stream) stream.close();
    conn.end();
    if (ws.readyState === ws.OPEN) ws.close(code, reason);
  };

  conn.on('ready', () => {
    log.info({ sessionId: session.sessionId, host, port }, 'ssh connection established');
    conn.shell({ term: 'xterm-256color', cols, rows }, (err, sshStream) => {
      if (err) {
        log.warn({ sessionId: session.sessionId, err: err.message }, 'ssh shell failed');
        ws.send(`\r\n\x1b[31m[Asha] Failed to open shell: ${err.message}\x1b[0m\r\n`);
        closeAll(1011, 'shell failed');
        return;
      }
      stream = sshStream;

      // PTY → browser
      sshStream.on('data', (chunk: Buffer) => {
        if (ws.readyState === ws.OPEN) ws.send(chunk);
      });
      sshStream.stderr.on('data', (chunk: Buffer) => {
        if (ws.readyState === ws.OPEN) ws.send(chunk);
      });
      sshStream.on('close', () => {
        log.debug({ sessionId: session.sessionId }, 'ssh shell closed');
        closeAll(1000, 'shell closed');
      });
    });
  });

  conn.on('error', (err) => {
    log.warn({ sessionId: session.sessionId, err: err.message }, 'ssh connection error');
    if (ws.readyState === ws.OPEN) {
      ws.send(`\r\n\x1b[31m[Asha] SSH connection error: ${err.message}\x1b[0m\r\n`);
      ws.close(1011, 'ssh error');
    }
  });

  conn.on('close', () => {
    if (ws.readyState === ws.OPEN) ws.close(1000);
  });

  // Browser → PTY (+ control frames)
  ws.on('message', (data: WebSocket.RawData, isBinary: boolean) => {
    const control = parseControlFrame(data, isBinary);
    if (control) {
      cols = control.cols;
      rows = control.rows;
      stream?.setWindow(rows, cols, 0, 0);
      return;
    }
    if (!stream || !stream.writable) return;
    stream.write(Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer));
  });

  ws.on('close', () => closeAll());
  ws.on('error', () => closeAll(1011, 'ws error'));

  conn.connect({
    host,
    port,
    username,
    ...(session.sshPrivateKey ? { privateKey: session.sshPrivateKey } : {}),
    ...(session.sshPassword ? { password: session.sshPassword } : {}),
    // Containers come and go; don't pin host keys (the network path is already
    // trusted: proxy ↔ container on the internal session network).
    readyTimeout: 15_000,
    // Detect a dead SSH host mid-session (~90s) and tear the WS down with a
    // clear message, instead of freezing the terminal until the OS TCP timeout
    // (several minutes). readyTimeout only covers the initial handshake.
    keepaliveInterval: 30_000,
    keepaliveCountMax: 3,
  });
}
