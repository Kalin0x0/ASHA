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
 *   5. guacd → proxy : ready,$<uuid>;
 *   After `connect`, everything is bridged verbatim.
 *
 * Connection parameters are filled from the session record (hostname, port,
 * username, password) keyed by the parameter names guacd advertises in `args`.
 *
 * The uuid in `ready` names the live connection: a second socket that sends
 * `select,$<uuid>` JOINS it and receives the same img/blob/sync stream, with no
 * second RDP/VNC logon on the target. That is how an observer watches a desktop
 * without touching the session the user is working in — the join answers
 * `read-only` with 'true', so guacd itself refuses input from it.
 *
 * An observer ONLY ever joins. With no uuid to join, or a join guacd refuses,
 * the socket closes with CLOSE_NO_LIVE_CONNECTION. Opening a connection instead
 * would log in a second time with the session's own credentials, and a
 * single-session Windows host answers that by moving the user's desktop onto the
 * observer — the very thing watching exists not to do.
 */

import type { IncomingMessage } from 'node:http';
import net from 'node:net';
import { StringDecoder } from 'node:string_decoder';
import { createLogger } from '@asha/logger';
import type WebSocket from 'ws';
import type { StreamMode } from '../auth.js';
import type { GuacUuidStore, SessionRecord } from '../session-store.js';
import { encodeInstruction, GuacamoleParser, MAX_PENDING } from './guac-protocol.js';
import { isRdpServerLayout } from './server-layouts.js';

const log = createLogger('proxy:guacamole');

/**
 * "There is nothing to watch": no live connection to join, so the observer is
 * refused rather than logged in a second time. The viewer needs it apart from a
 * 4003 to say that nobody is at this desktop right now, instead of blaming the
 * observer's rights. The reason repeats the code because guacamole-common-js
 * reads the close REASON, not `event.code` (see proxy.ts).
 */
export const CLOSE_NO_LIVE_CONNECTION = 4010;
const REASON_NO_LIVE_CONNECTION = `${CLOSE_NO_LIVE_CONNECTION} Nobody is connected to this desktop`;
/** A frame that is not the Guacamole protocol. Only a hand-written client sends one. */
const CLOSE_BAD_FRAME = 1008;

const GUACD_HOST = process.env.GUACD_HOST ?? 'localhost';
const GUACD_PORT = Number(process.env.GUACD_PORT ?? 4822);
const DEFAULT_WIDTH = Number(process.env.GUAC_DEFAULT_WIDTH ?? 1280);
const DEFAULT_HEIGHT = Number(process.env.GUAC_DEFAULT_HEIGHT ?? 720);
const DEFAULT_DPI = 96;
/**
 * Last-resort keyboard layout for the REMOTE desktops, e.g. `de-de-qwertz`.
 * Empty leaves guacd on its own default (en-us-qwerty), which mistypes every key
 * that differs on a German keyboard: z/y swapped, the whole AltGr row, the
 * umlauts. Read once at startup, so it can only ever describe every host at
 * once — which is why a host that names its own keyboard is believed over it,
 * and the viewer over both.
 */
const SERVER_LAYOUT = process.env.GUAC_RDP_SERVER_LAYOUT ?? '';

/** Build the value for each parameter guacd asks for, from the session record. */
export function resolveParam(name: string, session: SessionRecord, mode: StreamMode = 'control'): string {
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
    // Which keyboard the REMOTE machine is set up with. The browser sends the
    // character a key produced, so the user's own keyboard is already accounted
    // for; this tells guacd which scancodes reproduce that character over there.
    //
    // Precedence: `?layout=` from the viewer beats the Server row, which beats
    // GUAC_RDP_SERVER_LAYOUT. The viewer override is highest so that someone
    // typing rubbish can put it right in one click instead of waiting for an
    // admin — three attempts at this bug went by without anyone having that
    // escape hatch. The `?layout=` case is handled by the caller, which puts it
    // in `overrides`; a Server row that names none leaves the value below.
    case 'server-layout':
      return session.keyboardLayout && isRdpServerLayout(session.keyboardLayout)
        ? session.keyboardLayout
        : SERVER_LAYOUT;
    // How the desktop looks standing still: wallpaper, window theming, font
    // smoothing. guacd disables these by default as a bandwidth optimisation,
    // which renders a black background and no theme — so they are on, and the
    // viewer's quality toggle is what turns them off.
    case 'enable-wallpaper':
      return 'true';
    case 'enable-theming':
      return 'true';
    case 'enable-font-smoothing':
      return 'true';
    // Motion, not fidelity: Aero translucency, dragging a window with its full
    // contents rather than an outline, and animated menus. Each turns an
    // otherwise static screen into a stream of repaints, and every repaint is
    // re-encoded and pushed down a link shared by every other desktop. A desktop
    // standing still looks identical without them, so they stay off in both
    // quality modes.
    case 'enable-full-window-drag':
    case 'enable-desktop-composition':
    case 'enable-menu-animations':
      return 'false';
    // Dynamic resolution: let the RDP session resize to match the browser window
    // on the fly (Windows 8.1+/RDP display-update channel), so any viewport size
    // fits with no letterbox.
    case 'resize-method':
      return 'display-update';
    // RemoteApp / RDS published-application launch (RDP only).
    case 'remote-app':
      return session.remoteApp ?? '';
    case 'remote-app-dir':
      return session.remoteAppDir ?? '';
    case 'remote-app-args':
      return session.remoteAppArgs ?? '';
    // Clipboard redirection — keep BOTH directions enabled so copy/paste works
    // between the local browser and the remote desktop. guacd defaults these to
    // enabled, but we set them explicitly so they can never be silently off.
    case 'disable-copy':
      return 'false';
    case 'disable-paste':
      return 'false';
    // Second enforcement point for an observer, independent of the instruction
    // filter in the browser→guacd path: guacd refuses input on a read-only
    // connection on its own, so a mistake in the filter is not a mistake that
    // lets someone type into a colleague's desktop.
    case 'read-only':
      return mode === 'view' ? 'true' : 'false';
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

/**
 * Instructions an observer is allowed to send. `sync` is the frame
 * acknowledgement guacd waits for before it sends the next frame — dropping it
 * stalls the stream — and `size` only describes the observer's own viewport.
 * Everything else (key, mouse, clipboard, file, pipe, ack, disconnect) is input
 * into somebody else's desktop.
 */
const VIEW_ALLOWED_OPCODES = new Set(['sync', 'nop', 'size']);

/**
 * Keep the instructions an observer may send, drop the rest. The frame is
 * rebuilt from the parsed elements rather than sliced, so nothing half-parsed
 * or malformed can reach guacd.
 */
export function filterViewInstructions(instructions: string[][]): string {
  let out = '';
  for (const [opcode, ...args] of instructions) {
    if (!opcode || !VIEW_ALLOWED_OPCODES.has(opcode)) continue;
    out += encodeInstruction(opcode, ...args);
  }
  return out;
}

export async function handleGuacamole(
  ws: WebSocket,
  req: IncomingMessage,
  session: SessionRecord,
  mode: StreamMode = 'control',
  store?: GuacUuidStore,
): Promise<void> {
  const protocol = session.protocol === 'RDP' ? 'rdp' : 'vnc';
  // Desktop size requested by the browser (its viewport `?w=&h=`) so the remote
  // fills the window with no letterbox bars. Clamped; falls back to defaults.
  const reqDims = (() => {
    try {
      const q = new URLSearchParams((req.url ?? '').split('?')[1] ?? '');
      const pick = (raw: string | null, lo: number, hi: number, def: number) => {
        const v = Number(raw);
        return Number.isFinite(v) && v >= lo && v <= hi ? Math.round(v) : def;
      };
      const layout = q.get('layout');
      return {
        width: pick(q.get('w'), 640, 3840, DEFAULT_WIDTH),
        height: pick(q.get('h'), 480, 2160, DEFAULT_HEIGHT),
        // perf=1 → bandwidth-saving mode (no wallpaper/theming); default = full.
        perf: q.get('perf') === '1',
        // The remote desktop's keyboard layout, as corrected by the person
        // looking at it. A name guacd does not know costs the whole connection,
        // so anything off the list is dropped here and the Server row answers.
        layout: layout && isRdpServerLayout(layout) ? layout : null,
      };
    } catch {
      return { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT, perf: false, layout: null };
    }
  })();

  // An observer joins the connection the session's own viewer already has open,
  // so the uuid guacd handed out for it has to be known before the handshake
  // starts.
  const joinUuid = mode === 'view' && store ? await store.getGuacUuid(session.kasmId) : null;
  if (mode === 'view' && joinUuid === null) {
    // Nobody is streaming this desktop through the proxy — or Redis could not
    // say, which from here is the same thing. Connecting anyway would mean a
    // logon with the session's credentials, and on a single-session Windows host
    // that hands the user's desktop to the observer and drops the user. So an
    // observer is told there is nothing to watch, and no connection is opened.
    log.info(
      { sessionId: session.sessionId, kasmId: session.kasmId },
      'no live connection to join — refusing to watch',
    );
    ws.close(CLOSE_NO_LIVE_CONNECTION, REASON_NO_LIVE_CONNECTION);
    return;
  }

  /**
   * Stop reading from guacd while the browser is behind.
   *
   * guacd is reached over the LAN and the browser over a link that is the real
   * constraint, so without this the proxy drains guacd at LAN speed and parks
   * the difference in Node's send queue — which has no ceiling. That queue then
   * IS the lag: the desktop renders a keystroke instantly, but its pixels wait
   * behind however many megabytes of already-obsolete frames are still in front
   * of them. It reads as "fine when idle, seconds behind the moment anything
   * repaints", which is exactly what users describe.
   *
   * Pausing the socket closes guacd's TCP window; guacd then coalesces the
   * frames it could not send, so the browser receives the CURRENT screen instead
   * of replaying an old one. The ceiling on staleness becomes HIGH_WATER divided
   * by the link rate — at 256 KB and 2.5 MB/s, about a tenth of a second.
   */
  const HIGH_WATER = 256 * 1024;
  const LOW_WATER = 64 * 1024;
  let drainTimer: ReturnType<typeof setInterval> | undefined;
  /** The guacd socket currently bridged — replaced once if a join is refused. */
  let guacd: net.Socket | null = null;
  const applyBackpressure = () => {
    if (!guacd || ws.bufferedAmount <= HIGH_WATER || guacd.isPaused()) return;
    guacd.pause();
    drainTimer ??= setInterval(() => {
      if (ws.readyState !== ws.OPEN) {
        clearInterval(drainTimer);
        drainTimer = undefined;
        return;
      }
      if (ws.bufferedAmount < LOW_WATER) {
        clearInterval(drainTimer);
        drainTimer = undefined;
        guacd?.resume();
      }
    }, 20);
  };

  // Handshake state: until `connected`, the proxy interprets guacd's
  // instructions; afterwards it bridges the stream to the browser.
  let connected = false;
  // Decoded guacd output not yet forwarded — holds a trailing PARTIAL instruction
  // until it completes, so every ws.send() carries only whole instructions.
  let pendingOut = '';
  /**
   * One-shot scan for `ready`. It is the first thing guacd sends after
   * `connect`, so the flag flips on the first forwarded frame and the desktop
   * stream costs nothing after that: ws.bufferedAmount is the whole staleness
   * budget, and per-frame work is what spends it.
   */
  let readyScanned = false;
  /** uuid published for this connection; withdrawn again when the socket goes. */
  let publishedUuid: string | null = null;

  // Availability: bound BOTH the TCP connect to guacd AND the guacd↔target
  // handshake. Without these, a slow/unreachable guacd or RDP host leaves the
  // browser spinning on "Connecting" forever (guacd never errors, just never
  // replies). Fail fast with a clear, reconnect-friendly message instead.
  const CONNECT_TIMEOUT_MS = Number(process.env.GUACD_CONNECT_TIMEOUT_MS ?? 10_000);
  const HANDSHAKE_TIMEOUT_MS = Number(process.env.GUACD_HANDSHAKE_TIMEOUT_MS ?? 25_000);
  const failFast = (code: number, reason: string) => {
    log.warn({ sessionId: session.sessionId, protocol }, reason);
    if (ws.readyState === ws.OPEN) ws.close(code, reason);
    if (guacd && !guacd.destroyed) guacd.destroy();
  };
  const connectTimer = setTimeout(
    () => failFast(4504, 'Remote gateway (guacd) did not respond in time — please reconnect.'),
    CONNECT_TIMEOUT_MS,
  );
  let handshakeTimer: ReturnType<typeof setTimeout> | undefined = setTimeout(() => {
    if (!connected) failFast(4504, 'The remote desktop did not finish starting — please reconnect.');
  }, HANDSHAKE_TIMEOUT_MS);
  const clearTimers = () => {
    clearTimeout(connectTimer);
    if (handshakeTimer) {
      clearTimeout(handshakeTimer);
      handshakeTimer = undefined;
    }
    if (drainTimer) {
      clearInterval(drainTimer);
      drainTimer = undefined;
    }
  };

  /** Open and drive the guacd connection: a join for an observer, else a logon. */
  const openGuacd = (joinId: string | null): void => {
    const parser = new GuacamoleParser();
    // guacd → browser must be TEXT frames: guacamole-common-js's WebSocketTunnel
    // calls .indexOf on every message, so binary frames throw "i.indexOf is not a
    // function". StringDecoder reassembles UTF-8 split across TCP chunks.
    const toBrowser = new StringDecoder('utf8');
    const sock = net.createConnection(GUACD_PORT, GUACD_HOST);
    guacd = sock;
    pendingOut = '';
    readyScanned = false;

    sock.once('connect', () => {
      clearTimeout(connectTimer);
      log.debug(
        { sessionId: session.sessionId, protocol, join: joinId !== null },
        'guacd connected — starting handshake',
      );
      // `$<uuid>` selects the LIVE connection instead of the protocol, which
      // joins it rather than logging in a second time.
      sock.write(encodeInstruction('select', joinId !== null ? `$${joinId}` : protocol));
    });

    sock.on('data', (chunk: Buffer) => {
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
          if (!readyScanned) {
            readyScanned = true;
            try {
              const ready = new GuacamoleParser().push(frame).find((inst) => inst[0] === 'ready');
              const uuid = ready?.[1]?.replace(/^\$/, '');
              // Only the connection somebody is working in is worth joining.
              // Publishing an observer's own uuid would let observers chain onto
              // each other and outlive the session they were watching.
              if (uuid && mode === 'control' && store) {
                publishedUuid = uuid;
                void store.setGuacUuid(session.kasmId, uuid);
              }
            } catch (e) {
              // The frame is already whole instructions, so this cannot happen
              // from guacd — and losing the uuid must not cost the user the
              // desktop that is otherwise streaming fine.
              log.warn(
                { sessionId: session.sessionId, err: (e as Error).message },
                'could not read the connection uuid — observers will find nothing to join',
              );
            }
          }
          if (ws.readyState === ws.OPEN) {
            ws.send(frame);
            applyBackpressure();
          }
        }
        return;
      }

      // During the handshake, parse instructions to find `args`.
      let handshake: string[][];
      try {
        handshake = parser.push(text);
      } catch (e) {
        log.warn({ sessionId: session.sessionId, err: (e as Error).message }, 'unreadable handshake from guacd');
        failFast(1011, 'The remote gateway answered with something unreadable — please reconnect.');
        return;
      }

      for (const inst of handshake) {
        const [opcode, ...args] = inst;
        if (opcode === 'error' && joinId !== null) {
          // "No such connection": the owner disconnected between the uuid being
          // published and this join. There is nothing left to watch, and the one
          // way to a picture from here would be a second logon on the target.
          log.info({ sessionId: session.sessionId, err: args[0] }, 'guacd refused the join');
          failFast(CLOSE_NO_LIVE_CONNECTION, REASON_NO_LIVE_CONNECTION);
          return;
        }
        if (opcode === 'args') {
          // args = [protocolVersion, ...paramNames]. A join advertises the full
          // protocol parameter list as well, `read-only` among it.
          const version = args[0] ?? 'VERSION_1_0_0';
          const paramNames = args.slice(1);
          // In performance mode the *appearance* flags are turned OFF (black
          // background, no theming) to save bandwidth; otherwise ON. The motion
          // flags are not listed here at all — resolveParam keeps them off in
          // both modes, because they buy nothing on a still screen and cost a
          // repaint stream on a moving one.
          const exp = reqDims.perf ? 'false' : 'true';
          const overrides: Record<string, string> = {
            width: String(reqDims.width),
            height: String(reqDims.height),
            // Only there when the viewer sent a layout guacd accepts; without
            // one resolveParam falls through to the Server row and then to the
            // deployment default. A VNC connection never advertises
            // `server-layout`, so nothing is asked for and nothing is sent.
            ...(reqDims.layout ? { 'server-layout': reqDims.layout } : {}),
            'enable-wallpaper': exp,
            'enable-theming': exp,
            'enable-font-smoothing': exp,
          };
          const values = paramNames.map((name) => overrides[name] ?? resolveParam(name, session, mode));

          // If guacd half-closed between the `args` reply and these writes, the
          // writes would silently buffer/no-op → a black screen with no error.
          // Guard once before the handshake-completion writes.
          if (!sock.writable) {
            failFast(1011, 'guacd connection closed during handshake — please reconnect.');
            break;
          }
          sock.write(
            encodeInstruction('size', String(reqDims.width), String(reqDims.height), String(DEFAULT_DPI)),
          );
          // Declare the image/audio mimetypes guacamole-common-js can decode.
          // CRITICAL: an empty `image` tells guacd the client supports NO image
          // formats, so guacd can't encode the desktop framebuffer → black screen
          // (only the cursor, which uses a separate channel). The browser supports
          // PNG/JPEG/WebP, so advertise them.
          sock.write(encodeInstruction('audio', 'audio/L8', 'audio/L16'));
          sock.write(encodeInstruction('video'));
          sock.write(encodeInstruction('image', 'image/jpeg', 'image/png', 'image/webp'));
          // The `connect` reply must echo a value for EVERY element guacd sent in
          // `args` — starting with the protocol version — or guacd rejects with
          // "Client did not return the expected number of arguments."
          sock.write(encodeInstruction('connect', version, ...values));

          connected = true;
          if (handshakeTimer) {
            clearTimeout(handshakeTimer);
            handshakeTimer = undefined;
          }
          log.info(
            { sessionId: session.sessionId, protocol, params: paramNames.length, mode, joined: joinId !== null },
            'guacd handshake complete — bridging',
          );
          // Any bytes guacd already buffered past `args` will arrive in the next
          // data event and be forwarded (connected is now true).
          break;
        }
      }
    });

    sock.on('error', (e) => {
      clearTimers();
      log.warn({ err: e.message, sessionId: session.sessionId }, 'guacd error');
      if (ws.readyState === ws.OPEN) ws.close(1011, `guacd error: ${e.message}`);
    });

    sock.on('close', () => {
      clearTimers();
      if (ws.readyState === ws.OPEN) ws.close(1000);
    });
  };

  openGuacd(joinUuid);

  // Browser → guacd: the PROXY drives the guacd handshake (it injects the
  // server-side RDP params), so we swallow the browser client's own handshake
  // (select/size/connect) until `connected`. After that the browser's frames
  // (key/mouse/clipboard) are written through verbatim — except an observer's,
  // which are filtered down to the acknowledgements.
  const fromBrowser = mode === 'view' ? new GuacamoleParser() : null;
  ws.on('message', (data) => {
    if (!connected || !guacd || !guacd.writable) return;
    let buf: Buffer | null = null;
    if (Buffer.isBuffer(data)) buf = data;
    else if (typeof data === 'string') buf = Buffer.from(data, 'utf8');
    else if (data instanceof ArrayBuffer) buf = Buffer.from(data);
    else if (Array.isArray(data)) buf = Buffer.concat(data);
    if (!buf) return;

    if (fromBrowser) {
      // An observer's frames are a `sync`, a `nop` or a `size` — tens of bytes.
      // ws hands over anything up to its maxPayload, so a frame this far out of
      // scale is refused before it is even decoded, let alone buffered.
      if (buf.length > MAX_PENDING) {
        failFast(CLOSE_BAD_FRAME, 'Oversized frame — closing the observer stream.');
        return;
      }
      let allowed: string;
      try {
        allowed = filterViewInstructions(fromBrowser.push(buf.toString('utf8')));
      } catch (e) {
        // Neither guacd nor guacamole-common-js produces one of these, so the
        // sender is not a viewer. Keeping the bytes would be the damage: nothing
        // parses behind them again and the buffer grows with every frame.
        log.warn(
          { sessionId: session.sessionId, err: (e as Error).message },
          'observer sent a frame that is not the Guacamole protocol',
        );
        failFast(CLOSE_BAD_FRAME, 'Malformed frame — closing the observer stream.');
        return;
      }
      if (allowed) guacd.write(allowed);
      return;
    }
    guacd.write(buf);
  });

  const releaseUuid = () => {
    if (publishedUuid && store) void store.clearGuacUuid(session.kasmId, publishedUuid);
    publishedUuid = null;
  };

  ws.on('close', () => {
    clearTimers();
    releaseUuid();
    if (guacd && !guacd.destroyed) guacd.destroy();
  });

  ws.on('error', () => {
    clearTimers();
    releaseUuid();
    if (guacd && !guacd.destroyed) guacd.destroy();
  });

  if (process.env.NODE_ENV !== 'production') {
    log.info(
      { guacdHost: GUACD_HOST, guacdPort: GUACD_PORT, sessionId: session.sessionId },
      `guacd bridge active — needs guacd at ${GUACD_HOST}:${GUACD_PORT} (GUACD_HOST / GUACD_PORT).`,
    );
  }
}
