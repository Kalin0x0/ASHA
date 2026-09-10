import { Inject } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  type OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Env } from '@asha/config';
import { prisma } from '@asha/db';
import type { WsServerEvent } from '@asha/events';
import type { Server, Socket } from 'socket.io';
import type { AuthUser } from '../../common/decorators';
import { ENV } from '../../common/env.module';
import { RbacService } from '../../common/rbac.service';
import { SessionsService } from './sessions.service';

/**
 * Realtime fan-out to dashboards and viewers.
 *
 * Rooms are process-local — there is no socket.io Redis adapter — so an emit
 * only reaches clients attached to THIS API process. That holds for the current
 * single-replica deployment; a second replica needs the adapter before anything
 * may rely on a client seeing every event.
 */
/**
 * `path` is the HTTP endpoint socket.io actually serves; `namespace` is only a
 * label inside the connection. Left at its default the handshake goes to
 * `/socket.io/`, which Traefik routes to the web container — the api router
 * matches `/api` and `/ws` (docker-compose.yml) — so the socket never reached
 * this gateway at all and every realtime update, the "you are being watched"
 * notice included, silently fell back to polling or nothing. Serving it under
 * `/ws` puts it inside the rule that already exists.
 */
@WebSocketGateway({ namespace: '/ws', path: '/ws/socket.io', cors: { origin: '*' } })
export class SessionsGateway implements OnGatewayConnection {
  @WebSocketServer() server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly rbac: RbacService,
    private readonly sessions: SessionsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /**
   * Every room is derived from a VERIFIED access token. The org room used to be
   * joined from `handshake.query.orgId` — a value the client picks — so any
   * socket could sit in another tenant's room and read its session stream; the
   * session room was joined with no ownership check at all. Session frames and
   * observation thumbnails travel through these rooms, so the handshake has to
   * decide who is in them, not the caller.
   */
  async handleConnection(client: Socket): Promise<void> {
    const user = await this.authenticate(client);
    if (!user) {
      client.disconnect(true);
      return;
    }
    client.join(`org:${user.orgId}`);
    // Org membership buys the low-sensitivity stream — session status, stats,
    // health. A frame of a colleague's desktop and the title of the window they
    // have open is a different thing entirely, so it gets a room of this
    // socket's own, which it has to earn with the permission GET
    // sessions/observations demands — and which only carries the sessions this
    // observer holds a window on. Without this, joining the org room WAS the
    // whole authorization.
    if (await this.mayObserve(user)) {
      client.join(observerRoom(user.orgId, user.sub));
    }

    const auth = client.handshake.auth as { sessionId?: unknown } | undefined;
    const sessionId = handshakeString(auth?.sessionId) ?? handshakeString(client.handshake.query.sessionId);
    if (!sessionId) return;
    // A socket that asked for a session it may not see keeps its org room rather
    // than being dropped: the request is wrong, not hostile by itself.
    const session = await this.sessionToJoin(sessionId, user);
    if (!session) return;
    client.join(`session:${sessionId}`);
    // `session.observed` is emitted on the transitions, so a viewer that was not
    // connected for one never learns of it — after a reload, a dropped socket,
    // or an API restart that took these rooms with it. Replaying the current
    // state into the socket that just joined is what brings the notice back on
    // the watched person's screen, and what takes down a banner left standing
    // for an observation that has since ended.
    client.emit('event', {
      type: 'session.observed',
      payload: await this.sessions.observedState({ id: sessionId, orgId: user.orgId, kasmId: session.kasmId, userId: session.userId }),
    } satisfies WsServerEvent);
  }

  emitToOrg(orgId: string, event: WsServerEvent): void {
    this.server?.to(`org:${orgId}`).emit('event', event);
  }

  /**
   * One observer's samples. Per observer rather than per org: a frame of a
   * desktop belongs to whoever holds the window it was captured for, and a room
   * the whole org's permission holders sat in served it to colleagues the audit
   * entry and the on-screen notice never named.
   */
  emitToObserver(orgId: string, observerUserId: string, event: WsServerEvent): void {
    this.server?.to(observerRoom(orgId, observerUserId)).emit('event', event);
  }

  emitToSession(sessionId: string, event: WsServerEvent): void {
    this.server?.to(`session:${sessionId}`).emit('event', event);
  }

  /**
   * `handshake.auth` is where socket.io-client puts credentials; the query
   * fallback keeps callers that can only build a URL working. Same secret and
   * claims as the HTTP guard — a websocket is not a second identity system.
   */
  private async authenticate(client: Socket): Promise<AuthUser | null> {
    const auth = client.handshake.auth as { token?: unknown } | undefined;
    const token = handshakeString(auth?.token) ?? handshakeString(client.handshake.query.token);
    if (!token) return null;
    try {
      const payload = await this.jwt.verifyAsync<AuthUser & { typ?: string }>(token, {
        secret: this.env.JWT_ACCESS_SECRET,
      });
      // A watch token verifies under this secret too — the connection-proxy has
      // no other one — but it is a capability for one desktop, not an identity.
      // The HTTP guard refuses it for the same reason.
      return payload.typ === undefined ? payload : null;
    } catch {
      return null;
    }
  }

  /** System admin or a real SESSION_OBSERVE holder — the same test the REST route makes. */
  private async mayObserve(user: AuthUser): Promise<boolean> {
    if (user.isSystemAdmin) return true;
    const granted = await this.rbac.effectivePermissions(user.sub);
    return granted.has('SESSION_OBSERVE') || granted.has('*');
  }

  /**
   * The session this socket may join, or null: owner, system admin, or a real
   * SESSION_VIEW_ANY holder, and nobody else. The row comes back rather than a
   * boolean because the notice replayed on the join is keyed by `kasmId`.
   */
  private async sessionToJoin(sessionId: string, user: AuthUser): Promise<{ kasmId: string | null; userId: string | null } | null> {
    // A handshake never passes through the tenant interceptor, so the Prisma
    // extension adds no orgId here and the filter has to be written out.
    const session = await prisma.session.findFirst({
      where: { id: sessionId, orgId: user.orgId },
      select: { userId: true, kasmId: true },
    });
    if (!session) return null;
    if (user.isSystemAdmin || session.userId === user.sub) return session;
    const granted = await this.rbac.effectivePermissions(user.sub);
    return granted.has('SESSION_VIEW_ANY') || granted.has('*') ? session : null;
  }
}

/**
 * The room one observer's samples are pushed into. Scoped by org as well as by
 * user so the tenant boundary holds by construction, the way every other room
 * here is built.
 */
function observerRoom(orgId: string, observerUserId: string): string {
  return `observe:${orgId}:${observerUserId}`;
}

/** A repeated query parameter arrives as an array; only a plain string counts. */
function handshakeString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
