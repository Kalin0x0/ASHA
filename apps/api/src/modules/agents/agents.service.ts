import { ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { AgentTokenScope } from '../../common/jwt-auth.guard';
import { JwtService } from '@nestjs/jwt';
import type { AgentHeartbeatDto, AgentRegisterDto, SessionStatsDto, SessionStatusDto } from '@asha/contracts';
import { prisma, runUnscoped } from '@asha/db';
import { RedisChannels } from '@asha/events';
import { sessionConnectionUrl } from '@asha/proxy-labels';
import { type Env, isPlaceholderHost, resolveSessionBaseUrl } from '@asha/config';
import { ENV } from '../../common/env.module';
import { RedisService } from '../../common/redis.service';
import { SessionsGateway } from '../sessions/sessions.gateway';

/** Maps the session's stored ConnectionType to the proxy's protocol tag. */
function proxyProtocol(connectionType: string): 'KASMVNC' | 'RDP' | 'VNC' | 'SSH' {
  switch (connectionType) {
    case 'GUAC_RDP':
      return 'RDP';
    case 'GUAC_VNC':
      return 'VNC';
    case 'GUAC_SSH':
      return 'SSH';
    default:
      return 'KASMVNC';
  }
}

@Injectable()
export class AgentsService {
  private readonly logger = new Logger('Agents');

  constructor(
    private readonly gateway: SessionsGateway,
    private readonly jwt: JwtService,
    private readonly redis: RedisService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async register(dto: AgentRegisterDto, scope?: AgentTokenScope) {
    return runUnscoped(async () => {
      let zone: Awaited<ReturnType<typeof prisma.deploymentZone.findFirst>>;
      if (scope?.scope === 'org') {
        // Minted token: enrollment is hard-constrained to the token's org (and a
        // pinned zone if set) — a token for org A can never enroll into org B.
        zone = scope.zoneId
          ? await prisma.deploymentZone.findFirst({ where: { id: scope.zoneId, orgId: scope.orgId } })
          : ((await prisma.deploymentZone.findFirst({ where: { name: dto.zone, orgId: scope.orgId } })) ??
            (await prisma.deploymentZone.findFirst({ where: { orgId: scope.orgId, isDefault: true } })) ??
            (await prisma.deploymentZone.findFirst({ where: { orgId: scope.orgId } })));
        if (!zone) throw new ForbiddenException('Token is not authorized for the requested zone');
      } else {
        // Shared env token (global super-admin enrollment) — resolve any zone by name.
        zone =
          (await prisma.deploymentZone.findFirst({ where: { name: dto.zone } })) ??
          (await prisma.deploymentZone.findFirst({ where: { isDefault: true } })) ??
          (await prisma.deploymentZone.findFirst({}));
      }
      if (!zone) throw new NotFoundException('No deployment zone to enroll into');

      const agent = await prisma.agent.upsert({
        where: { orgId_hostname: { orgId: zone.orgId, hostname: dto.hostname } },
        update: {
          status: 'ONLINE',
          version: dto.version,
          cpuCores: dto.cpuCores,
          memTotalMb: dto.memTotalMb,
          maxSessions: dto.maxSessions ?? Math.max(1, Math.floor(dto.cpuCores / 2)),
          lastHeartbeatAt: new Date(),
        },
        create: {
          orgId: zone.orgId,
          zoneId: zone.id,
          hostname: dto.hostname,
          kind: 'DOCKER',
          status: 'ONLINE',
          version: dto.version,
          cpuCores: dto.cpuCores,
          memTotalMb: dto.memTotalMb,
          maxSessions: dto.maxSessions ?? Math.max(1, Math.floor(dto.cpuCores / 2)),
          lastHeartbeatAt: new Date(),
        },
      });
      this.logger.log(`Agent ${dto.hostname} enrolled into zone ${zone.name}`);
      // Return the resolved zone NAME so the agent subscribes to the exact
      // provision/destroy channels the manager publishes on. The requested zone
      // (dto.zone) may not exist, in which case enrollment falls back to the
      // default zone — the agent must follow that, not its local env value.
      return {
        agentId: agent.id,
        zoneId: zone.id,
        zoneName: zone.name,
        sessionNetwork: this.env.ASHA_SESSION_NETWORK,
      };
    });
  }

  async heartbeat(agentId: string, dto: AgentHeartbeatDto) {
    await runUnscoped(async () => {
      // A heartbeat reports the agent as live, but a pending admin drain wins:
      // keep DRAINING so the scheduler won't place new sessions on it.
      const agent = await prisma.agent.findUnique({
        where: { id: agentId },
        select: { drainRequested: true },
      });
      // `currentSessions` is the scheduler's capacity signal. Derive it from the
      // AUTHORITATIVE DB count of this agent's non-terminal sessions rather than
      // trusting the agent's self-reported tally (`dto.currentSessions`). That
      // tally is the size of an in-process Map that only shrinks on an explicit
      // DESTROY; a missed destroy (agent offline when it was published, a session
      // reaped straight in the DB, or a container removed out-of-band) leaves a
      // phantom entry forever. The reported count then creeps above maxSessions
      // and the scheduler permanently filters the agent out — so every new launch
      // fails with "no agent available" / hangs until the launch-timeout. Counting
      // real sessions makes capacity self-healing and immune to orphaned
      // containers and leaked map entries. The atomic reserve in
      // SchedulerService still guards concurrent launches between heartbeats.
      const currentSessions = await prisma.session.count({
        where: { agentId, status: { notIn: ['ERROR', 'DESTROYED', 'TERMINATING'] } },
      });
      await prisma.agent.update({
        where: { id: agentId },
        data: {
          status: agent?.drainRequested ? 'DRAINING' : 'ONLINE',
          memFreeMb: dto.memFreeMb,
          loadPercent: dto.loadPercent,
          currentSessions,
          version: dto.version,
          lastHeartbeatAt: new Date(),
        },
      });
    });
    return { ok: true };
  }

  async updateSessionStatus(sessionId: string, dto: SessionStatusDto) {
    return runUnscoped(async () => {
      const session = await prisma.session.findUnique({ where: { id: sessionId } });
      if (!session) throw new NotFoundException('Session not found');

      // Lifecycle floor: once a session is TERMINATING/DESTROYED (e.g. the
      // staging reconciler retired a still-PROVISIONING pool session, or a
      // reaper tore it down), a late agent report must NOT resurrect it into a
      // live/claimable state. Instead, tell the agent to tear the just-started
      // container down — otherwise it runs orphaned, untracked, and (for a
      // staged row) reappears as a RUNNING ghost with userId null.
      if (
        (session.status === 'TERMINATING' || session.status === 'DESTROYED') &&
        dto.status !== 'DESTROYED' &&
        dto.status !== 'ERROR'
      ) {
        const containerId = dto.containerId ?? session.containerId;
        if (containerId && session.zoneId) {
          const zone = await prisma.deploymentZone.findUnique({
            where: { id: session.zoneId },
            select: { name: true },
          });
          await this.redis.publish(RedisChannels.destroy(zone?.name ?? 'default'), {
            sessionId: session.id,
            containerId,
            reason: 'terminated_during_provision',
          });
        }
        this.logger.warn(
          `Ignoring '${dto.status}' report for ${session.id} already ${session.status}; ordered orphan container teardown`,
        );
        return { ok: true };
      }

      const data: Record<string, unknown> = { status: dto.status };
      if (dto.containerId) data.containerId = dto.containerId;
      if (dto.internalHost) data.internalHost = dto.internalHost;
      if (dto.host) data.host = dto.host;
      if (dto.port) data.port = dto.port;
      if (dto.traefikRouterName) data.traefikRouterName = dto.traefikRouterName;
      if (dto.error) data.errorMessage = dto.error;

      if (dto.status === 'RUNNING') {
        // zoneId is null only on history whose zone was deleted; a session going
        // RUNNING always has one. resolveSessionBaseUrl already falls back when
        // the zone carries no proxyBaseUrl.
        const zone = session.zoneId
          ? await prisma.deploymentZone.findUnique({ where: { id: session.zoneId } })
          : null;
        const token = await this.jwt.signAsync(
          { sid: session.id, kasmId: session.kasmId },
          { secret: this.env.SESSION_TOKEN_SECRET, expiresIn: this.env.SESSION_TOKEN_TTL },
        );
        const baseUrl = resolveSessionBaseUrl(this.env, zone?.proxyBaseUrl);
        const connectionUrl = sessionConnectionUrl({
          kasmId: session.kasmId,
          proxyBaseUrl: baseUrl,
          token,
        });
        data.connectionUrl = connectionUrl;
        data.startedAt = session.startedAt ?? new Date();

        // Log the FINAL resolved workspace URL (without the session token) so
        // operators can confirm it before the browser is sent there — and warn
        // loudly when the host won't resolve for real users (the asha.local
        // DNS-failure class of bug).
        this.logger.log(
          `session ${session.id} ready → ${connectionUrl.split('?')[0]} (zone=${zone?.name ?? 'default'})`,
        );
        if (isPlaceholderHost(baseUrl)) {
          this.logger.warn(
            `session ${session.id} stream host "${new URL(baseUrl).hostname}" is not publicly resolvable; ` +
              'set WORKSPACE_PUBLIC_BASE_URL (or the zone proxyBaseUrl) to a host reachable by end users.',
          );
        }

        // A1: if the workspace publishes a RemoteApp, the proxy launches it via
        // guacd's remote-app params instead of a full desktop.
        const remoteApp = session.workspaceId
          ? await prisma.remoteApp.findFirst({ where: { workspaceId: session.workspaceId } })
          : null;

        // Publish the connection record the connection-proxy reads to bridge
        // RDP/VNC/SSH sessions (keyed by kasmId). KasmVNC goes straight through
        // Traefik and doesn't need this, but writing it is harmless.
        await this.redis.set(
          `asha:proxy:session:${session.kasmId}`,
          {
            sessionId: session.id,
            kasmId: session.kasmId,
            orgId: session.orgId,
            userId: session.userId,
            protocol: proxyProtocol(session.connectionType),
            internalHost: dto.internalHost ?? session.internalHost ?? undefined,
            internalPort: dto.port ?? session.port ?? undefined,
            status: 'RUNNING',
            sshUser: dto.sshUser,
            sshPassword: dto.sshPassword,
            sshPrivateKey: dto.sshPrivateKey,
            rdpUser: dto.rdpUser,
            rdpPassword: dto.rdpPassword,
            remoteApp: remoteApp?.path,
            remoteAppArgs: remoteApp?.args ?? undefined,
          },
          3600,
        );

        this.gateway.emitToSession(session.id, { type: 'session.ready', payload: { sessionId: session.id, connectionUrl } });
      }

      // Release the slot the scheduler reserved once the session reaches a
      // terminal state — DESTROYED (ran then torn down) or ERROR (never came
      // up). Only the *first* active→terminal transition decrements, so an
      // ERROR later followed by DESTROYED cleanup cannot double-release.
      const wasActive = session.status !== 'DESTROYED' && session.status !== 'ERROR';
      if ((dto.status === 'DESTROYED' || dto.status === 'ERROR') && session.agentId && wasActive) {
        await prisma.agent.updateMany({
          where: { id: session.agentId, currentSessions: { gt: 0 } },
          data: { currentSessions: { decrement: 1 } },
        });
      }

      if (dto.status === 'DESTROYED') {
        data.destroyedAt = new Date();
        await this.redis.del(`asha:proxy:session:${session.kasmId}`);
      }

      await prisma.session.update({ where: { id: sessionId }, data });
      this.gateway.emitToOrg(session.orgId, {
        type: 'session.status',
        payload: { sessionId, status: dto.status, containerId: dto.containerId },
      });
      return { ok: true };
    });
  }

  async ingestStats(dto: SessionStatsDto) {
    for (const sample of dto.samples) {
      await runUnscoped(() =>
        prisma.session.updateMany({
          where: { id: sample.sessionId },
          data: { resources: { cpuPct: sample.cpuPct, memMb: sample.memMb } as object },
        }),
      ).catch(() => undefined);
      const session = await prisma.session.findUnique({ where: { id: sample.sessionId } });
      if (session) {
        this.gateway.emitToOrg(session.orgId, { type: 'session.stats', payload: sample });
      }
    }
    return { ok: true };
  }

  async listAgents() {
    return prisma.agent.findMany({ orderBy: { hostname: 'asc' }, include: { zone: { select: { name: true } } } });
  }

  async setAgentState(id: string, status: 'ONLINE' | 'DRAINING' | 'OFFLINE') {
    // Persist the drain intent so heartbeats don't flip a drained agent back online.
    return prisma.agent.update({
      where: { id },
      data: { status, drainRequested: status === 'DRAINING' },
    });
  }

  async remove(id: string) {
    await prisma.agent.delete({ where: { id } });
    return { ok: true };
  }
}
