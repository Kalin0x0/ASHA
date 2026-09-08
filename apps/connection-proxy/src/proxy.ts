import type { IncomingMessage } from 'node:http';
import { createLogger } from '@asha/logger';
import type WebSocket from 'ws';
import { AuthError, type StreamMode, type TokenPayload, verifyToken } from './auth.js';
import { handleGuacamole } from './handlers/guacamole.js';
import { handleKasmVNC } from './handlers/kasmvnc.js';
import { handleSSH } from './handlers/ssh.js';
import type { SessionRecord, SessionStore, WatchRecordStore } from './session-store.js';

const log = createLogger('proxy:ws');

/**
 * Close codes for a view socket whose grant ended. Neither is a refusal — the
 * observer may go on watching, they just have to mint a new watch token first,
 * and minting is what re-runs the permission check, the org policy, the notice
 * and the audit entry. The viewer needs them apart from a plain 4003 to offer
 * that instead of retrying a token that can no longer work.
 */
export const CLOSE_WATCH_EXPIRED = 4005;
export const CLOSE_WATCH_REVOKED = 4006;
/**
 * The reason repeats the code because guacamole-common-js reads the close REASON
 * (`parseInt`) and only falls back to `event.code` when it is empty — without
 * the prefix the viewer gets NaN and cannot tell an ended grant from a refusal.
 */
const REASON_EXPIRED = `${CLOSE_WATCH_EXPIRED} Watch grant expired`;
const REASON_REVOKED = `${CLOSE_WATCH_REVOKED} Observation stopped`;

/** How often a view socket re-reads the watch record that authorizes it. */
const WATCH_POLL_MS = 5_000;

/** Extract kasmId from request URL pattern: /session/:kasmId (kasmId is a CUID). */
function extractKasmId(url: string | undefined): string | null {
  if (!url) return null;
  const m = /^\/session\/([a-z0-9]+)/i.exec(url.split('?')[0] ?? '');
  return m?.[1] ?? null;
}

/**
 * Which input rights a token grants over a session's stream. The org check is
 * the caller's, so it keeps its own rejection log line.
 *
 * A watch token is minted for exactly one session and carries no input rights,
 * so it is answered first: it must never fall through to a branch that grants
 * control.
 */
export function resolveStreamMode(
  session: Pick<SessionRecord, 'userId'>,
  token: TokenPayload,
  kasmId: string,
): StreamMode | null {
  if (token.mode === 'view') return token.kasmId === kasmId ? 'view' : null;
  if (session.userId === token.sub) return 'control';
  // A staged pool session has no owner for the moment between the agent
  // publishing it and the launcher claiming it. Refusing here would not close a
  // hole — it would break launching.
  if (session.userId === null) return 'control';
  return null;
}

/**
 * Tie a view socket to the grant that opened it.
 *
 * Authorization used to happen once, at the upgrade, and the socket then
 * bridged bytes until one side hung up — so an observer who pressed stop kept a
 * full-rate view of the desktop while the audit trail, the notice and the wall
 * all said the observation was over. Two things end it now:
 *
 * - the token's `exp`, because everything that makes watching lawful happens
 *   when a watch token is minted, and a socket that outlives its token has
 *   outlived all of it;
 * - the API's watch record, which stop deletes. Redis is the only channel the
 *   API and this process share, so the record is re-read on a timer rather than
 *   pushed. One GET per view socket every few seconds — off the guacd data path
 *   entirely, and control sockets never enter here.
 *
 * A record that cannot be read is unknown, not gone: dropping every observer
 * because Redis blinked would be the worse failure of the two.
 */
export function bindViewToGrant(
  ws: WebSocket,
  kasmId: string,
  expiresAt: number,
  store: WatchRecordStore,
): void {
  let expiry: ReturnType<typeof setTimeout> | undefined;
  let poll: ReturnType<typeof setInterval> | undefined;
  let checking = false;

  const clear = () => {
    if (expiry) clearTimeout(expiry);
    if (poll) clearInterval(poll);
    expiry = undefined;
    poll = undefined;
  };
  const end = (code: number, reason: string) => {
    clear();
    if (ws.readyState === ws.OPEN) ws.close(code, reason);
  };

  expiry = setTimeout(() => {
    log.info({ kasmId }, 'Watch token expired — closing the observation stream');
    end(CLOSE_WATCH_EXPIRED, REASON_EXPIRED);
  }, Math.max(0, expiresAt - Date.now()));

  poll = setInterval(() => {
    // Never stack reads on a slow Redis: the answer is only interesting once.
    if (checking) return;
    checking = true;
    void store
      .isWatchActive(kasmId)
      .then((active) => {
        if (active !== false) return;
        log.info({ kasmId }, 'Observation stopped — closing the observation stream');
        end(CLOSE_WATCH_REVOKED, REASON_REVOKED);
      })
      .finally(() => {
        checking = false;
      });
  }, WATCH_POLL_MS);

  ws.on('close', clear);
  ws.on('error', clear);
}

function extractToken(req: IncomingMessage): string | null {
  const raw = req.url?.split('?')[1];
  if (!raw) return null;
  const params = new URLSearchParams(raw);
  return params.get('token');
}

export async function handleUpgrade(
  ws: WebSocket,
  req: IncomingMessage,
  store: SessionStore,
): Promise<void> {
  const kasmId = extractKasmId(req.url);
  if (!kasmId) {
    ws.close(4004, 'Session ID missing from URL');
    return;
  }

  const rawToken = extractToken(req);
  if (!rawToken) {
    ws.close(4001, 'Missing token query param');
    return;
  }

  let tokenPayload;
  try {
    tokenPayload = verifyToken(rawToken);
  } catch (e) {
    const msg = e instanceof AuthError ? e.message : 'Auth error';
    log.warn({ kasmId, err: msg }, 'WebSocket auth rejected');
    ws.close(4003, msg);
    return;
  }

  const session = await store.get(kasmId);
  if (!session) {
    log.warn({ kasmId, userId: tokenPayload.sub }, 'Session not found in proxy store');
    ws.close(4004, 'Session not found or not yet ready');
    return;
  }

  if (session.orgId !== tokenPayload.orgId) {
    log.warn({ kasmId, reqOrgId: tokenPayload.orgId, sessOrgId: session.orgId }, 'Org mismatch — rejecting');
    ws.close(4003, 'Unauthorized');
    return;
  }

  const mode = resolveStreamMode(session, tokenPayload, kasmId);
  if (!mode) {
    log.warn({ kasmId, reqUserId: tokenPayload.sub, sessUserId: session.userId }, 'Not the session owner and no watch token — rejecting');
    ws.close(4003, 'Unauthorized');
    return;
  }

  if (mode === 'view') {
    // A watch token with no expiry would authorize a stream nobody can end, so
    // it is not a grant. jwt.verify already refuses an expired one; this is the
    // token that never carried an `exp` in the first place.
    const expiresAt = typeof tokenPayload.exp === 'number' ? tokenPayload.exp * 1000 : 0;
    if (expiresAt <= Date.now()) {
      log.warn({ kasmId, userId: tokenPayload.sub }, 'Watch token carries no expiry — rejecting');
      ws.close(CLOSE_WATCH_EXPIRED, REASON_EXPIRED);
      return;
    }
    // The window may already be closed: the token outlives the record by 30 s,
    // and a stop deletes the record the moment it is pressed. Only a definite
    // "gone" refuses — see isWatchActive on why unknown must not.
    if ((await store.isWatchActive(kasmId)) === false) {
      log.warn({ kasmId, userId: tokenPayload.sub }, 'No observation window open for this session — rejecting');
      ws.close(CLOSE_WATCH_REVOKED, REASON_REVOKED);
      return;
    }
    bindViewToGrant(ws, kasmId, expiresAt, store);
  }

  log.info({ kasmId, sessionId: session.sessionId, protocol: session.protocol, userId: tokenPayload.sub, mode }, 'WebSocket connected');

  switch (session.protocol) {
    case 'KASMVNC':
      handleKasmVNC(ws, req, session);
      break;
    case 'RDP':
    case 'VNC':
      await handleGuacamole(ws, req, session, mode, store);
      break;
    case 'SSH':
      handleSSH(ws, req, session, mode);
      break;
    default:
      ws.close(4000, `Unknown protocol: ${String(session.protocol)}`);
  }
}
