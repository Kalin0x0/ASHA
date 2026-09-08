import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Interval } from '@nestjs/schedule';
import type { Env } from '@asha/config';
import type { SessionObservationDto, StartObservationDto } from '@asha/contracts';
import { prisma, runUnscoped } from '@asha/db';
import type { SessionObservationSample } from '@asha/events';
import type { AuthUser } from '../../common/decorators';
import { ENV } from '../../common/env.module';
import type { AgentTokenScope } from '../../common/jwt-auth.guard';
import { RbacService } from '../../common/rbac.service';
import { RedisService } from '../../common/redis.service';
import { SecurityEventService } from '../../common/security-event.service';
import { SessionsGateway } from '../sessions/sessions.gateway';
import { SessionsService } from '../sessions/sessions.service';

/** Newest sample for one session. */
const sampleKey = (kasmId: string) => `asha:obs:${kasmId}`;
/**
 * Who is watching one session right now — the record the notice on the watched
 * person's screen is built from, and the one thing a running observation is
 * revoked through.
 *
 * The value is `{ holds: WatchHold[] }` and it has three readers, none of which
 * imports this: this service, `SessionsService.observationHolds` (the banner a
 * viewer reads back after a reload), and the connection-proxy's `isWatchActive`,
 * which spells the key out as a literal in session-store.ts because it shares no
 * code with the API. Whether one observer may still watch is answered from
 * `observerUserId` and `expiresAt`, never from the key existing — the key
 * outlives its longest hold, and one of several observers stopping does not
 * delete it.
 */
const watchKey = (kasmId: string) => `asha:obs:watch:${kasmId}`;

// A frame of someone's desktop is the most sensitive artefact this product
// holds. Samples live in Redis for half a minute and reach neither Postgres nor
// disk, so nothing accumulates and nothing outlives the observation window.
const SAMPLE_TTL_SEC = 30;
// The watch record deliberately outlives the agent's capture window, so a
// renewal that arrives a few seconds late does not blink the notice off and on.
const WATCH_TTL_SEC = 90;
// Dead-man switch handed to the agent: it stops capturing on its own this long
// after the last OBSERVE_START, so a closed browser tab cannot leave a capture
// loop running inside someone's desktop.
const CAPTURE_TTL_MS = 60_000;
// Long enough to open the stream, and short enough that a copy of one is stale
// before it is useful.
const WATCH_TOKEN_TTL_SEC = 120;
// What the watch token is, written into the token itself. It is signed with the
// API's access secret because that is the only secret the connection-proxy
// holds, so the claim — not the signature — is what keeps it from being a
// bearer credential for this admin's whole API: JwtAuthGuard and SessionsGateway
// refuse any token that names a type, and the proxy grants view rights to
// nothing else. Mirrored in apps/connection-proxy/src/auth.ts.
const WATCH_TOKEN_TYPE = 'watch';

// Which of a caller's holds a request opens, renews or releases. The wall keeps
// one hold per tile and the read-only viewer it opens keeps its own, so the wall
// unmounting on that navigation releases only the tile's — the window, and with
// it the notice, survives the observer walking from the thumbnail to the desktop.
// A caller that sends none has exactly one hold per session, which is what a
// surface that only ever opens one wants; two surfaces that both send none share
// it, and either one's release ends the other's window.
const DEFAULT_WINDOW_ID = 'default';
const WINDOW_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
// The id is the caller's to choose, so a caller inventing a fresh one per
// request would grow this record without bound — and every reader of it, the
// watched user's own connection fetch included, pays for that on each read. Past
// the cap the holds nearest their deadline give way; a surface that is really
// still there renews within 20 s and takes its place back.
const MAX_HOLDS_PER_OBSERVER = 8;

// How often lapsed holds are collected. A hold that was never released — the
// observer's browser died mid-observation — shows up only as an expiry, so
// something has to come and look.
const SWEEP_INTERVAL_MS = 15_000;
// The record outlives its last hold by more than one sweep, because a lapse the
// sweep cannot read is a lapse it cannot end: the key would take the evidence
// with it. Nothing else sees the extra seconds — every reader filters on each
// hold's own deadline.
const RECORD_GRACE_SEC = 30;

/**
 * One hold on a session's observation window.
 *
 * Holds are counted rather than overwritten. Two administrators may watch the
 * same desktop, and one of them pressing stop must not clear the other's notice
 * or stop the other's capture — `SessionObservedEvent.active` has always been
 * documented as "false once the LAST observer leaves".
 */
interface WatchHold {
  observerUserId: string;
  observerName: string;
  /** Distinguishes several holds by the same observer. */
  windowId: string;
  /** When this observer started watching, carried across their renewals. */
  since: string;
  /** Epoch ms this hold lapses at unless it is renewed. */
  expiresAt: number;
  /**
   * What this hold asked the capture to be. Kept on the hold rather than acted
   * on directly, because the agent has one capture window per session and every
   * hold on that session has to be weighed against it — see `captureWindow`.
   */
  intervalMs: number;
  thumbWidth: number;
}

interface WatchRecord {
  holds: WatchHold[];
}

/** What ending a window needs to know about the session it ran on. */
interface WatchedSession {
  id: string;
  orgId: string;
  kasmId: string;
  userId: string | null;
  zoneId: string | null;
  agentId: string | null;
  containerId: string | null;
}

/**
 * What opening or renewing a hold answers with.
 *
 * `watchKind` says what the caller may render: a proxy route for the guacamole
 * viewer, this same capture at live cadence, or nothing at all — in which case
 * `watchReason` names the obstacle in the same machine-readable style as
 * `reason` names a missing thumbnail, and no watch token exists to hand out.
 */
interface ObservationWindow {
  /** Echoed back so the caller renews and releases the hold it just took. */
  windowId: string;
  thumbnails: boolean;
  reason?: string;
  watchKind: WatchKind;
  watchReason?: WatchReason;
  watchToken?: string;
  watchUrl?: string;
}

/**
 * `guac` is a connection-proxy route the guacamole viewer opens; `stream` is
 * the capture the agent is already taking, asked for at a live cadence and a
 * larger width. `none` means there is no way in at all.
 */
type WatchKind = 'guac' | 'stream' | 'none';
type WatchReason = 'no_shared_terminal' | 'no_shared_view' | 'no_capture_agent';

/** What watchTarget decided, before it is turned into an answer. */
type WatchTarget = { kind: 'guac' } | { kind: 'stream' } | { kind: 'none'; reason: WatchReason };

/**
 * The same, with the credential the guacamole route needs — minted alongside it
 * rather than beside it, so a route can never be handed out without the token
 * that is the only thing making it read-only.
 */
type ResolvedTarget = { kind: 'guac'; token: string } | Exclude<WatchTarget, { kind: 'guac' }>;

/**
 * The holds still standing, the observer who has been watching longest first —
 * that is the one the banner names, so it stays put while others come and go.
 *
 * A hold whose observer stopped renewing is dropped here rather than at the
 * key's own TTL, because the key lives as long as its longest hold: one admin
 * closing their laptop must not keep the notice up on the strength of another's
 * renewals. Anything that is not a hold list — a record written by an older
 * build, a half-written value — reads as nobody watching.
 */
function liveHolds(record: WatchRecord | null, now: number): WatchHold[] {
  return allHolds(record).filter((h) => h.expiresAt > now);
}

/**
 * Every hold in a record, lapsed ones included, oldest first. Only the sweep
 * wants these: it is the difference between this list and `liveHolds` that says
 * whose observation ended without anyone releasing it.
 */
function allHolds(record: WatchRecord | null): WatchHold[] {
  if (!record || !Array.isArray(record.holds)) return [];
  return record.holds
    .filter((h) => h && typeof h.expiresAt === 'number' && typeof h.observerUserId === 'string')
    .sort((a, b) => Date.parse(a.since) - Date.parse(b.since));
}

/** How many people are behind those holds — one observer may hold several. */
function observerCount(holds: WatchHold[]): number {
  return new Set(holds.map((h) => h.observerUserId)).size;
}

// What a hold written before it carried its own parameters was asking for. The
// wall was the only caller then, and its defaults are the schema's.
const LEGACY_INTERVAL_MS = 5_000;
const LEGACY_THUMB_WIDTH = 320;

/**
 * How the session has to be captured to satisfy every hold on it at once.
 *
 * The agent keeps ONE capture window per session, so the parameters are a
 * property of the session and not of whoever posted last. Forwarding each
 * caller's own values made every renewal a re-tune: a wall left open in another
 * tab dropped a colleague's live view from 960 px every 700 ms to 320 px every
 * five seconds, roughly every twenty seconds, and the live view went on calling
 * that "live" because five seconds is inside its stall window.
 *
 * The shortest interval and the widest frame anyone is waiting for, therefore —
 * the most demanding observer sets the cadence, and everyone else is served by
 * it. Null when nobody wants frames at all (every hold sits at interval 0, the
 * "metadata only" setting), which is a stop rather than a slower capture.
 */
function captureWindow(holds: WatchHold[]): { intervalMs: number; thumbWidth: number } | null {
  const wanted = holds.map((h) => ({
    intervalMs: typeof h.intervalMs === 'number' ? h.intervalMs : LEGACY_INTERVAL_MS,
    thumbWidth: typeof h.thumbWidth === 'number' ? h.thumbWidth : LEGACY_THUMB_WIDTH,
  }));
  const capturing = wanted.filter((w) => w.intervalMs > 0);
  if (capturing.length === 0) return null;
  return {
    intervalMs: Math.min(...capturing.map((w) => w.intervalMs)),
    thumbWidth: Math.max(...capturing.map((w) => w.thumbWidth)),
  };
}

/**
 * Live observation: an administrator watches a running session.
 *
 * Watching someone work is only lawful when it is authorized, audited and
 * visible to the person being watched, so the permission check, the audit entry
 * and the notice all happen in the same call that mints the watch token rather
 * than around it.
 */
@Injectable()
export class ObservationService {
  private readonly logger = new Logger(ObservationService.name);

  constructor(
    private readonly sessions: SessionsService,
    private readonly gateway: SessionsGateway,
    private readonly redis: RedisService,
    private readonly security: SecurityEventService,
    private readonly rbac: RbacService,
    private readonly jwt: JwtService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /**
   * Open (or renew) one hold on a session's observation window.
   *
   * Opening and renewing are the same request on purpose — the agent takes its
   * cadence and its dead-man deadline from the last one it saw — but only the
   * opening is a transition: the notice goes out and the audit row is written
   * when an observer joins, never on the heartbeat that keeps them there.
   */
  async start(user: AuthUser, sessionId: string, dto: StartObservationDto, window?: string) {
    const windowId = this.holdId(window);
    const session = await this.findInOrg(sessionId, user.orgId);
    await this.assertMayObserve(session, user);
    if (!(await this.policyEnabled(user.orgId, 'observation.enabled'))) {
      throw new ForbiddenException('Live observation is switched off for this organisation');
    }
    if (!session.userId) {
      // An unclaimed pre-warmed session has nobody at the desktop: nothing to
      // observe, and no one the notice could reach.
      throw new BadRequestException('This session has not been claimed by a user');
    }
    if (session.status !== 'RUNNING' && session.status !== 'DEGRADED') {
      throw new BadRequestException(`Session is ${session.status}; only a running session can be observed`);
    }

    const notify = await this.policyEnabled(user.orgId, 'observation.notifyUser');
    const observerName = await this.observerName(user);
    const now = Date.now();

    // Thumbnails are taken by the agent inside the container. A fixed-server
    // session (RDP/VNC onto a real host) has no agent, and the only other route
    // to a frame would be a second logon on the user's machine — which is
    // exactly what observation must not do. Those tiles stay metadata-only and
    // carry the reason why.
    const capture = dto.intervalMs > 0 && Boolean(session.agentId && session.containerId);
    const reason = capture ? undefined : dto.intervalMs > 0 ? 'no_agent' : 'capture_disabled';

    const target = await this.resolveTarget(user, session);

    // Read-modify-write on a plain key: two calls landing in the same
    // millisecond can lose one hold, which the loser re-asserts on its next
    // renewal 20 s later. A Redis set per session would trade that for a second
    // key to expire in step with this one, and at this scale the trade is not
    // worth making.
    const before = liveHolds(await this.redis.get<WatchRecord>(watchKey(session.kasmId)), now);
    const mine = before.filter((h) => h.observerUserId === user.sub);
    const taken: WatchHold = {
      observerUserId: user.sub,
      observerName,
      windowId,
      // A second hold by the same person continues their window rather than
      // restarting it, so the banner keeps counting from when they arrived.
      since: mine[0]?.since ?? new Date(now).toISOString(),
      expiresAt: now + WATCH_TTL_SEC * 1000,
      intervalMs: dto.intervalMs,
      thumbWidth: dto.thumbWidth,
    };
    const holds: WatchHold[] = [
      ...before.filter((h) => h.observerUserId !== user.sub),
      ...this.capped(
        mine.filter((h) => h.windowId !== windowId),
        taken,
      ),
    ];
    await this.redis.set(watchKey(session.kasmId), { holds } satisfies WatchRecord, this.recordTtlSec(holds, now));
    await this.retuneCapture(session, holds);

    // Everything below is about the transition. A renewal changes nothing the
    // watched person or the audit trail needs to hear about, and announcing it
    // three times a minute per tile is what made both unreadable.
    const opened = mine.length === 0;
    if (!opened) {
      return this.windowFor(session, windowId, target, capture, reason);
    }

    // The notice goes out in the same call that hands over the token. As a
    // follow-up step it would be optional in practice — dropping one request
    // would buy silent observation.
    if (notify) {
      const named = liveHolds({ holds }, now)[0] ?? holds[0];
      this.gateway.emitToSession(session.id, {
        type: 'session.observed',
        payload: { sessionId: session.id, observerName: named.observerName, since: named.since, active: true },
      });
    }

    await this.security.emit({
      action: 'observation.start',
      severity: 'warn',
      orgId: session.orgId,
      actorUserId: user.sub,
      targetType: 'Session',
      targetId: session.id,
      metadata: {
        observedUserId: session.userId,
        kasmId: session.kasmId,
        thumbnails: capture,
        notified: notify,
        // Someone else was already watching when this observer joined: the
        // trail has to show an overlap, not a second independent window.
        observers: observerCount(holds),
      },
    });

    return this.windowFor(session, windowId, target, capture, reason);
  }

  /**
   * Tell the agent what this session is to be captured at now.
   *
   * A command is a statement about the session, never about the caller: the
   * agent holds one window per session, so the values are reconciled across
   * every hold still standing before they are sent. It runs on each open,
   * renewal and release — a renewal because the command carries the dead-man
   * deadline the agent stops itself on, and a release because the observer who
   * left must not leave the session captured at the cadence they asked for.
   */
  private async retuneCapture(
    session: { id: string; zoneId: string | null; kasmId: string; agentId: string | null; containerId: string | null },
    holds: WatchHold[],
  ): Promise<void> {
    // No agent inside it, so there is nothing to capture and nothing to stop —
    // a fixed server is watched through the proxy instead.
    if (!session.agentId || !session.containerId) return;
    const window = captureWindow(holds);
    if (!window) {
      await this.sessions.sendControl(session, { action: 'OBSERVE_STOP', kasmId: session.kasmId });
      return;
    }
    await this.sessions.sendControl(session, {
      action: 'OBSERVE_START',
      kasmId: session.kasmId,
      intervalMs: window.intervalMs,
      ttlMs: CAPTURE_TTL_MS,
      thumbWidth: window.thumbWidth,
    });
  }

  /**
   * Which way in this session has, and the token that buys it.
   *
   * Only the guacamole route is bought with one, and it mints a fresh one on
   * every renewal: the token lives 120 s while an observation lives as long as
   * the observer keeps watching, so a viewer that reconnects has one that still
   * works.
   */
  private async resolveTarget(
    user: AuthUser,
    session: { orgId: string; kasmId: string; connectionType: string; agentId: string | null; containerId: string | null },
  ): Promise<ResolvedTarget> {
    const target = this.watchTarget(session);
    if (target.kind !== 'guac') return target;
    const token = await this.jwt.signAsync(
      { sub: user.sub, orgId: session.orgId, kasmId: session.kasmId, mode: 'view', typ: WATCH_TOKEN_TYPE },
      { secret: this.env.JWT_ACCESS_SECRET, expiresIn: WATCH_TOKEN_TTL_SEC },
    );
    return { kind: 'guac', token };
  }

  /** What the caller gets back: the hold it now holds, and the way in, if any. */
  private windowFor(
    session: { kasmId: string },
    windowId: string,
    target: ResolvedTarget,
    thumbnails: boolean,
    reason: string | undefined,
  ): ObservationWindow {
    const common = { windowId, thumbnails, ...(reason ? { reason } : {}) };
    if (target.kind === 'none') return { ...common, watchKind: 'none', watchReason: target.reason };
    // The container's live view is this same capture at a higher rate: the page
    // is a route in the admin app, not an address on the session, so there is
    // nothing here to hand out and nothing to expire.
    if (target.kind === 'stream') return { ...common, watchKind: 'stream' };
    return {
      ...common,
      watchKind: 'guac',
      watchToken: target.token,
      watchUrl: `/connect/${encodeURIComponent(session.kasmId)}?monitor=1&watch=${encodeURIComponent(target.token)}`,
    };
  }

  /**
   * The key outlives its longest hold, never less: an admin renewing at 20 s
   * intervals must not have the record expire under a colleague who left. The
   * grace on top is what leaves the sweep something to read once the last hold
   * has lapsed — see RECORD_GRACE_SEC.
   */
  private recordTtlSec(holds: WatchHold[], now: number): number {
    const last = Math.max(...holds.map((h) => h.expiresAt));
    return Math.max(1, Math.ceil((last - now) / 1000)) + RECORD_GRACE_SEC;
  }

  /**
   * The observer's other holds plus the one this request just took, trimmed to
   * the cap. The holds nearest their deadline give way first — those are the
   * likeliest to be surfaces that went away without releasing anything — and the
   * hold just taken is never one of them.
   */
  private capped(others: WatchHold[], taken: WatchHold): WatchHold[] {
    if (others.length < MAX_HOLDS_PER_OBSERVER) return [...others, taken];
    const kept = [...others].sort((a, b) => b.expiresAt - a.expiresAt).slice(0, MAX_HOLDS_PER_OBSERVER - 1);
    return [...kept, taken];
  }

  /**
   * Which hold a request means. A malformed id is refused rather than
   * normalised: collapsing it into the default one would silently merge the
   * wall's hold with the viewer's and bring back the blink the ids prevent.
   */
  private holdId(window: string | undefined): string {
    if (window === undefined || window === '') return DEFAULT_WINDOW_ID;
    if (!WINDOW_ID_RE.test(window)) throw new BadRequestException('Invalid observation window id');
    return window;
  }

  /**
   * Where the observer is sent, and what will render there.
   *
   * A fixed server (RDP/VNC through guacd) streams through the connection-proxy,
   * which JOINS the running guacd connection read-only. No second logon on the
   * target, no risk of reconnecting a single-session Windows host onto the
   * observer, and read-only is enforced by guacd itself. The watch token is what
   * buys that, so it travels in the URL.
   *
   * A container desktop gets the capture stream instead, at a live cadence and a
   * larger frame. It never reaches the proxy — the browser loads a container
   * from Traefik — and three attempts at giving it a route of its own each ended
   * the same way, because a container label cannot be rotated while the
   * container runs: first a viewer credential that outlived the grant it was
   * handed out for, then one that escalated to the write route, then one that
   * was never minted at all. The capture is read-only by construction (there is
   * no input channel to guard), needs no credential, no cookie and no route, and
   * is already inside the grant, the audit entry and the notice.
   *
   * A terminal has no second seat: guacd cannot join a running SSH connection,
   * so a view-mode stream would authenticate again as the session user and
   * allocate a fresh PTY — a real login on the target, in its auth log and
   * against its session limit, showing an empty shell rather than the one the
   * user is working in.
   */
  private watchTarget(session: {
    connectionType: string;
    agentId: string | null;
    containerId: string | null;
  }): WatchTarget {
    switch (session.connectionType) {
      case 'GUAC_RDP':
      case 'GUAC_VNC':
        return { kind: 'guac' };
      case 'KASMVNC':
        // The frames come from the agent inside the container, so a container
        // session the manager has lost track of has nothing to show.
        return session.agentId && session.containerId
          ? { kind: 'stream' }
          : { kind: 'none', reason: 'no_capture_agent' };
      case 'GUAC_SSH':
        return { kind: 'none', reason: 'no_shared_terminal' };
      case 'NEKO_WEBRTC':
        // The desktop is a WebRTC peer connection negotiated between the user's
        // browser and the container. There is no second seat on it and no
        // capture path into it, and the proxy record carries the KasmVNC
        // protocol, so a guacamole route would close with a bare 4000 and the
        // observer would read "connection failed". Say what is actually true.
        return { kind: 'none', reason: 'no_shared_view' };
      default:
        // A kind added later refuses rather than guessing at a viewer for it.
        return { kind: 'none', reason: 'no_shared_view' };
    }
  }

  /**
   * Release one hold. Capture stops and the notice clears when the last one is
   * gone — never because one of several observers looked away.
   */
  async stop(user: AuthUser, sessionId: string, window?: string) {
    const windowId = this.holdId(window);
    const session = await this.findInOrg(sessionId, user.orgId);
    await this.assertMayObserve(session, user);

    // Read before clearing: the event describes the window that just ended, so
    // it carries the observer who held it rather than whoever closed it.
    const now = Date.now();
    const before = liveHolds(await this.redis.get<WatchRecord>(watchKey(session.kasmId)), now);
    const mine = before.filter((h) => h.observerUserId === user.sub);
    const holds = before.filter((h) => !(h.observerUserId === user.sub && h.windowId === windowId));
    // Their last hold: this observer has stopped watching, whatever anyone else
    // is still doing. A caller who held nothing releases nothing, and a stop
    // that arrives twice must not write the window down as ending twice.
    const closed = mine.length > 0 && !holds.some((h) => h.observerUserId === user.sub);

    if (holds.length === 0) {
      await this.redis.del(watchKey(session.kasmId));
      this.gateway.emitToSession(session.id, {
        type: 'session.observed',
        payload: {
          sessionId: session.id,
          observerName: mine[0]?.observerName ?? (await this.observerName(user)),
          since: mine[0]?.since ?? new Date(now).toISOString(),
          active: false,
        },
      });
    } else {
      await this.redis.set(watchKey(session.kasmId), { holds } satisfies WatchRecord, this.recordTtlSec(holds, now));
      // Somebody is still watching, so the banner stays up — but it must stop
      // naming the person who left, and go on counting from whoever has been
      // there longest. Gated on the same policy start() honours: an org that
      // switched the notice off must not have it appear the moment one of two
      // observers walks away.
      if (closed && (await this.policyEnabled(session.orgId, 'observation.notifyUser'))) {
        const named = holds[0];
        this.gateway.emitToSession(session.id, {
          type: 'session.observed',
          payload: { sessionId: session.id, observerName: named.observerName, since: named.since, active: true },
        });
      }
    }
    await this.retuneCapture(session, holds);

    if (closed) {
      await this.security.emit({
        action: 'observation.stop',
        severity: 'warn',
        orgId: session.orgId,
        actorUserId: user.sub,
        targetType: 'Session',
        targetId: session.id,
        // Without this an overlapping observation reads as if watching ended
        // here, when in truth only this observer's window did.
        metadata: {
          observedUserId: session.userId,
          kasmId: session.kasmId,
          stillObserved: holds.length > 0,
        },
      });
    }
    return { ok: true };
  }

  /**
   * Collect the holds nobody released.
   *
   * A hold is released by the observer's browser, and a browser that died
   * releases nothing — the tab was closed, the laptop slept, the process was
   * killed. `stop()` is the only writer of `observation.stop` and the only
   * emitter of `active: false`, so without this the notice would stay up on the
   * watched person's screen for the rest of their session, telling them they are
   * being watched while nobody is, and the trail would keep a start with no end.
   *
   * Holds carry their own deadline, so collecting them is a read: what lapsed
   * since the last pass is torn down exactly the way releasing it would have
   * torn it down. Runs on the tick, like the reapers beside it, and in one
   * process for the same reason they do.
   */
  @Interval('observation-sweeper', SWEEP_INTERVAL_MS)
  async sweepLapsedHolds(): Promise<number> {
    // Only the statuses a hold can be sitting under. A session that was
    // destroyed took its viewer with it, and its record expires on its own.
    const sessions = await prisma.session.findMany({
      where: { status: { in: ['RUNNING', 'DEGRADED', 'PAUSED', 'TERMINATING'] } },
      select: {
        id: true,
        orgId: true,
        kasmId: true,
        userId: true,
        zoneId: true,
        agentId: true,
        containerId: true,
      },
      take: 500,
    });
    let ended = 0;
    for (const session of sessions) ended += await this.expireHolds(session);
    if (ended > 0) this.logger.log(`Ended ${ended} observation window(s) whose observer stopped renewing`);
    return ended;
  }

  /**
   * End whatever has lapsed on one session; answers whether an observer's window
   * ended here. One of several surfaces going quiet is not the end of anyone's
   * window — only an observer left holding nothing has stopped watching.
   */
  private async expireHolds(session: WatchedSession): Promise<number> {
    const now = Date.now();
    const record = await this.redis.get<WatchRecord>(watchKey(session.kasmId));
    const before = allHolds(record);
    // Nothing held, or nothing lapsed. Redis being down reads as the former: no
    // teardown is written on an answer nobody could give.
    if (before.length === 0) return 0;
    const holds = before.filter((h) => h.expiresAt > now);
    if (holds.length === before.length) return 0;

    const lapsed = before.filter((h) => h.expiresAt <= now);
    const gone = [...new Set(lapsed.map((h) => h.observerUserId))].filter(
      (id) => !holds.some((h) => h.observerUserId === id),
    );

    if (holds.length === 0) {
      await this.redis.del(watchKey(session.kasmId));
      this.gateway.emitToSession(session.id, {
        type: 'session.observed',
        payload: {
          sessionId: session.id,
          observerName: lapsed[0].observerName,
          since: lapsed[0].since,
          active: false,
        },
      });
    } else {
      await this.redis.set(watchKey(session.kasmId), { holds } satisfies WatchRecord, this.recordTtlSec(holds, now));
      // Still watched, but possibly by someone else now: the banner must stop
      // naming an observer who is no longer there. Under the notice policy, for
      // the reason stop() gives — a lapse is not a licence to start announcing.
      if (
        before[0].observerUserId !== holds[0].observerUserId &&
        (await this.policyEnabled(session.orgId, 'observation.notifyUser'))
      ) {
        this.gateway.emitToSession(session.id, {
          type: 'session.observed',
          payload: {
            sessionId: session.id,
            observerName: holds[0].observerName,
            since: holds[0].since,
            active: true,
          },
        });
      }
    }
    await this.retuneCapture(session, holds);

    for (const observerUserId of gone) {
      await this.security.emit({
        action: 'observation.stop',
        severity: 'warn',
        orgId: session.orgId,
        actorUserId: observerUserId,
        targetType: 'Session',
        targetId: session.id,
        metadata: {
          observedUserId: session.userId,
          kasmId: session.kasmId,
          stillObserved: holds.length > 0,
          // Nobody closed this window; it ran out. The observation ended when
          // the hold lapsed, up to one sweep before this row was written.
          reason: 'lapsed',
        },
      });
    }
    return gone.length > 0 ? 1 : 0;
  }

  /**
   * Snapshot of the samples this caller may see: one per session they hold an
   * open window on, and no others.
   *
   * SESSION_OBSERVE says the caller may observe, not that they are observing.
   * Answering with every sample the org holds handed one administrator the
   * frames and focused-window titles of every desktop a COLLEAGUE had opened a
   * window on — outside the audit entry that names the watcher and outside the
   * notice on the watched person's screen, both of which belong to the hold.
   * The hold is therefore what is read, per session, before the sample is.
   *
   * Reading the org's sessions and then their keys — rather than scanning
   * `asha:obs:*` — keeps the answer tenant-scoped by construction.
   */
  async list(user: AuthUser) {
    const sessions = await prisma.session.findMany({
      where: { orgId: user.orgId, status: { notIn: ['DESTROYED', 'TERMINATING'] } },
      select: { id: true, kasmId: true },
      take: 200,
    });
    const now = Date.now();
    const items: Array<SessionObservationSample & { sessionId: string }> = [];
    for (const session of sessions) {
      const holds = liveHolds(await this.redis.get<WatchRecord>(watchKey(session.kasmId)), now);
      if (!holds.some((h) => h.observerUserId === user.sub)) continue;
      // Null when the sample aged out or Redis is down: an empty wall is the
      // degraded mode, never an error.
      const sample = await this.redis.get<SessionObservationSample>(sampleKey(session.kasmId));
      if (sample) items.push({ ...sample, sessionId: session.id });
    }
    return { items };
  }

  /** Agent to manager: one sample taken inside a container. */
  async ingest(kasmId: string, dto: SessionObservationDto, scope?: AgentTokenScope) {
    return runUnscoped(async () => {
      const session = await prisma.session.findUnique({
        where: { kasmId },
        select: { id: true, orgId: true },
      });
      if (!session) throw new NotFoundException('Session not found');
      this.assertScopeCovers(scope, session.orgId);

      // The routed kasmId wins over the one in the body, so the sample and the
      // key it is stored under cannot disagree.
      const sample: SessionObservationSample = { ...dto, kasmId };
      await this.redis.set(sampleKey(kasmId), sample, SAMPLE_TTL_SEC);
      // To the observers holding a window on THIS session, and nobody else. The
      // sample carries a frame of the desktop and the title of the focused
      // window; a room per org would have handed both to every colleague who
      // merely holds the permission, which is the same hole list() closes.
      // Redis unreadable means no holds, which means no fan-out — the poll picks
      // the wall back up once it answers again.
      const holds = liveHolds(await this.redis.get<WatchRecord>(watchKey(kasmId)), Date.now());
      for (const observerUserId of new Set(holds.map((h) => h.observerUserId))) {
        this.gateway.emitToObserver(session.orgId, observerUserId, {
          type: 'session.observation',
          payload: { ...sample, sessionId: session.id },
        });
      }
      return { ok: true };
    });
  }

  /**
   * An agent token proves "some agent", not "this agent", and the internal
   * route's params come off the wire — so a minted org token may only feed its
   * own org's sessions. Mirrors AgentsService, NotFound included: a Forbidden
   * here would answer which kasmIds exist in other tenants.
   */
  private assertScopeCovers(scope: AgentTokenScope | undefined, orgId: string) {
    if (scope?.scope === 'org' && scope.orgId !== orgId) {
      throw new NotFoundException('Not found');
    }
  }

  /**
   * Row-level authorization the route guard cannot do: SESSION_OBSERVE says the
   * caller may observe something, not that they may observe THIS session. Same
   * shape as SessionsService.assertSessionScope — owner or system admin always,
   * anyone else needs the permission for real.
   */
  private async assertMayObserve(session: { userId: string | null }, user: AuthUser) {
    if (user.isSystemAdmin) return;
    if (session.userId && session.userId === user.sub) return;
    const granted = await this.rbac.effectivePermissions(user.sub);
    if (granted.has('SESSION_OBSERVE') || granted.has('*')) return;
    throw new ForbiddenException('You do not have access to this session');
  }

  /**
   * Org policy switch. Absent means ON: the feature was asked for, and a notice
   * nobody configured must still be shown. Only an explicit `false` turns it
   * off, following the `isolation.denyByDefault` precedent.
   */
  private async policyEnabled(
    orgId: string,
    key: 'observation.enabled' | 'observation.notifyUser',
  ): Promise<boolean> {
    const row = await prisma.setting.findUnique({
      where: { scope_orgId_zoneId_key: { scope: 'ORG', orgId, zoneId: '', key } },
      select: { valueJson: true },
    });
    return row?.valueJson !== false;
  }

  /** The name the observed user reads in the notice — never an opaque id. */
  private async observerName(user: AuthUser): Promise<string> {
    const row = await prisma.user.findUnique({
      where: { id: user.sub },
      select: { displayName: true, email: true },
    });
    return row?.displayName || row?.email || user.email;
  }

  /** Load a session scoped to the caller's org — a foreign id is simply absent. */
  private async findInOrg(id: string, orgId: string) {
    const session = await prisma.session.findFirst({ where: { id, orgId } });
    if (!session) throw new NotFoundException('Session not found');
    return session;
  }
}
