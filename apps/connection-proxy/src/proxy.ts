import type { IncomingMessage } from 'node:http';
import { createLogger } from '@chista/logger';
import type WebSocket from 'ws';
import { AuthError, verifyToken } from './auth.js';
import { handleGuacamole } from './handlers/guacamole.js';
import { handleKasmVNC } from './handlers/kasmvnc.js';
import { handleSSH } from './handlers/ssh.js';
import type { SessionStore } from './session-store.js';

const log = createLogger('proxy:ws');

/** Extract kasmId from request URL pattern: /session/:kasmId */
function extractKasmId(url: string | undefined): string | null {
  if (!url) return null;
  const m = /^\/session\/([a-f0-9]+)/i.exec(url.split('?')[0] ?? '');
  return m?.[1] ?? null;
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

  log.info({ kasmId, sessionId: session.sessionId, protocol: session.protocol, userId: tokenPayload.sub }, 'WebSocket connected');

  switch (session.protocol) {
    case 'KASMVNC':
      handleKasmVNC(ws, req, session);
      break;
    case 'RDP':
    case 'VNC':
      handleGuacamole(ws, req, session);
      break;
    case 'SSH':
      handleSSH(ws, req, session);
      break;
    default:
      ws.close(4000, `Unknown protocol: ${String(session.protocol)}`);
  }
}
