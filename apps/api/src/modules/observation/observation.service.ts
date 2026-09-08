import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
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
/** Who is watching one session right now — drives the notice the user sees. */
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
// Long enough to open the stream, short enough to be worthless once copied.
const WATCH_TOKEN_TTL_SEC = 120;

interface WatchRecord {
  observerUserId: string;
  observerName: string;
  since: string;
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
  constructor(
    private readonly sessions: SessionsService,
    private readonly gateway: SessionsGateway,
    private readonly redis: RedisService,
    private readonly security: SecurityEventService,
    private readonly rbac: RbacService,
    private readonly jwt: JwtService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Open (or renew) an observation window on one session. */
  async start(user: AuthUser, sessionId: string, dto: StartObservationDto) {
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
    const since = new Date().toISOString();

    // Thumbnails are taken by the agent inside the container. A fixed-server
    // session (RDP/VNC onto a real host) has no agent, and the only other route
    // to a frame would be a second logon on the user's machine — which is
    // exactly what observation must not do. Those tiles stay metadata-only and
    // carry the reason why.
    const capture = dto.intervalMs > 0 && Boolean(session.agentId && session.containerId);
    const reason = capture ? undefined : dto.intervalMs > 0 ? 'no_agent' : 'capture_disabled';

    const watchToken = await this.jwt.signAsync(
      { sub: user.sub, orgId: session.orgId, kasmId: session.kasmId, mode: 'view' },
      { secret: this.env.JWT_ACCESS_SECRET, expiresIn: WATCH_TOKEN_TTL_SEC },
    );

    if (capture) {
      await this.sessions.sendControl(session, {
        action: 'OBSERVE_START',
        kasmId: session.kasmId,
        intervalMs: dto.intervalMs,
        ttlMs: CAPTURE_TTL_MS,
        thumbWidth: dto.thumbWidth,
      });
    }

    await this.redis.set(
      watchKey(session.kasmId),
      { observerUserId: user.sub, observerName, since } satisfies WatchRecord,
      WATCH_TTL_SEC,
    );
    // The notice goes out in the same call that hands over the token. As a
    // follow-up step it would be optional in practice — dropping one request
    // would buy silent observation.
    if (notify) {
      this.gateway.emitToSession(session.id, {
        type: 'session.observed',
        payload: { sessionId: session.id, observerName, since, active: true },
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
      },
    });

    return {
      watchToken,
      watchUrl: `/connect/${encodeURIComponent(session.kasmId)}?monitor=1&watch=${encodeURIComponent(watchToken)}`,
      expiresAt: new Date(Date.now() + WATCH_TOKEN_TTL_SEC * 1000).toISOString(),
      thumbnails: capture,
      ...(reason ? { reason } : {}),
    };
  }

  /** Close the observation window: capture stops, the notice clears. */
  async stop(user: AuthUser, sessionId: string) {
    const session = await this.findInOrg(sessionId, user.orgId);
    await this.assertMayObserve(session, user);

    // Read before clearing: the event describes the window that just ended, so
    // it carries the observer who held it rather than whoever closed it.
    const watch = await this.redis.get<WatchRecord>(watchKey(session.kasmId));
    await this.redis.del(watchKey(session.kasmId));
    if (session.agentId && session.containerId) {
      await this.sessions.sendControl(session, { action: 'OBSERVE_STOP', kasmId: session.kasmId });
    }
    this.gateway.emitToSession(session.id, {
      type: 'session.observed',
      payload: {
        sessionId: session.id,
        observerName: watch?.observerName ?? (await this.observerName(user)),
        since: watch?.since ?? new Date().toISOString(),
        active: false,
      },
    });

    await this.security.emit({
      action: 'observation.stop',
      severity: 'warn',
      orgId: session.orgId,
      actorUserId: user.sub,
      targetType: 'Session',
      targetId: session.id,
      metadata: { observedUserId: session.userId, kasmId: session.kasmId },
    });
    return { ok: true };
  }

  /**
   * Snapshot of every sample currently held for the caller's org. Reading the
   * org's sessions and then their keys — rather than scanning `asha:obs:*` —
   * keeps the answer tenant-scoped by construction.
   */
  async list(user: AuthUser) {
    const sessions = await prisma.session.findMany({
      where: { orgId: user.orgId, status: { notIn: ['DESTROYED', 'TERMINATING'] } },
      select: { id: true, kasmId: true },
      take: 200,
    });
    const items: Array<SessionObservationSample & { sessionId: string }> = [];
    for (const session of sessions) {
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
      this.gateway.emitToOrg(session.orgId, {
        type: 'session.observation',
        payload: { ...sample, sessionId: session.id },
      });
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
