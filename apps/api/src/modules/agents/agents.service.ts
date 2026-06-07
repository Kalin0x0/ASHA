import { ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { AgentTokenScope } from '../../common/jwt-auth.guard';
import { JwtService } from '@nestjs/jwt';
import type { AgentHeartbeatDto, AgentRegisterDto, SessionStatsDto, SessionStatusDto } from '@chista/contracts';
import { prisma, runUnscoped } from '@chista/db';
import { sessionConnectionUrl } from '@chista/proxy-labels';
import type { Env } from '@chista/config';
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
          maxSessions: Math.max(1, Math.floor(dto.cpuCores / 2)),
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
          maxSessions: Math.max(1, Math.floor(dto.cpuCores / 2)),
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
        sessionNetwork: this.env.CHISTA_SESSION_NETWORK,
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
      await prisma.agent.update({
        where: { id: agentId },
        data: {
          status: agent?.drainRequested ? 'DRAINING' : 'ONLINE',
          memFreeMb: dto.memFreeMb,
          loadPercent: dto.loadPercent,
          currentSessions: dto.currentSessions,
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

      const data: Record<string, unknown> = { status: dto.status };
      if (dto.containerId) data.containerId = dto.containerId;
      if (dto.internalHost) data.internalHost = dto.internalHost;
      if (dto.host) data.host = dto.host;
      if (dto.port) data.port = dto.port;
      if (dto.traefikRouterName) data.traefikRouterName = dto.traefikRouterName;
      if (dto.error) data.errorMessage = dto.error;

      if (dto.status === 'RUNNING') {
        const zone = await prisma.deploymentZone.findUnique({ where: { id: session.zoneId } });
        const token = await this.jwt.signAsync(
          { sid: session.id, kasmId: session.kasmId },
          { secret: this.env.SESSION_TOKEN_SECRET, expiresIn: this.env.SESSION_TOKEN_TTL },
        );
        const connectionUrl = sessionConnectionUrl({
          kasmId: session.kasmId,
          proxyBaseUrl: zone?.proxyBaseUrl ?? this.env.CHISTA_PUBLIC_URL,
          token,
        });
        data.connectionUrl = connectionUrl;
        data.startedAt = session.startedAt ?? new Date();

        // Publish the connection record the connection-proxy reads to bridge
        // RDP/VNC/SSH sessions (keyed by kasmId). KasmVNC goes straight through
        // Traefik and doesn't need this, but writing it is harmless.
        await this.redis.set(
          `chista:proxy:session:${session.kasmId}`,
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
        await this.redis.del(`chista:proxy:session:${session.kasmId}`);
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
