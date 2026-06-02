import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import type { CreateSessionDto } from '@chista/contracts';
import { prisma } from '@chista/db';
import { type ProvisionCommand, RedisChannels, type RunConfig } from '@chista/events';
import { AuditService } from '../../common/audit.service';
import type { AuthUser } from '../../common/decorators';
import { RedisService } from '../../common/redis.service';
import { ConnectivityRenderService } from '../connectivity/connectivity-render.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { SchedulerService } from './scheduler.service';

@Injectable()
export class SessionsService {
  constructor(
    private readonly scheduler: SchedulerService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
    @Optional() private readonly render?: ConnectivityRenderService,
    // Optional so unit tests can construct the service without the webhook deps;
    // when present, domain events fan out to subscribed webhooks.
    @Optional() private readonly webhooks?: WebhooksService,
  ) {}

  async create(user: AuthUser, dto: CreateSessionDto) {
    const workspace = await prisma.workspace.findUnique({
      where: { id: dto.workspaceId },
      include: { image: true },
    });
    if (!workspace || !workspace.enabled) throw new NotFoundException('Workspace not available');

    const zone =
      (dto.zoneId
        ? await prisma.deploymentZone.findUnique({ where: { id: dto.zoneId } })
        : await prisma.deploymentZone.findFirst({ where: { isDefault: true } })) ??
      (await prisma.deploymentZone.findFirst({}));
    if (!zone) throw new BadRequestException('No deployment zone available');

    const protocol = workspace.image?.protocol ?? 'KASMVNC';
    const connectionType =
      protocol === 'KASMVNC' ? 'KASMVNC'
      : protocol === 'WEBRTC' ? 'NEKO_WEBRTC'
      : 'GUAC_RDP';
    // Hard lifetime cap: the reaper terminates the session once expiresAt passes.
    const expiresAt = workspace.maxDurationMinutes
      ? new Date(Date.now() + workspace.maxDurationMinutes * 60_000)
      : null;
    const session = await prisma.session.create({
      data: {
        orgId: user.orgId,
        userId: user.sub,
        workspaceId: workspace.id,
        imageId: workspace.imageId,
        zoneId: zone.id,
        status: 'REQUESTED',
        connectionType,
        workspaceName: workspace.friendlyName,
        imageName: workspace.image?.friendlyName,
        launchValues: (dto.launchValues ?? {}) as object,
        expiresAt,
        lastKeepaliveAt: new Date(),
      },
    });

    const agent = await this.scheduler.pickAgent(zone.id);
    if (agent) {
      await prisma.session.update({
        where: { id: session.id },
        data: { status: 'SCHEDULED', agentId: agent.id },
      });
      await this.dispatchProvision(session.id, zone.name, workspace, protocol);
    }

    await this.audit.record({
      orgId: user.orgId,
      actorUserId: user.sub,
      action: 'session.create',
      targetType: 'Session',
      targetId: session.id,
      metadata: { workspace: workspace.name },
    });

    await this.webhooks?.dispatch(user.orgId, 'session.created', {
      sessionId: session.id,
      workspaceId: workspace.id,
      userId: user.sub,
    });

    return prisma.session.findUnique({ where: { id: session.id } });
  }

  private async dispatchProvision(
    sessionId: string,
    zoneName: string,
    workspace: {
      id: string;
      orgId: string;
      image: { dockerImage: string; runConfigDefaults: unknown; protocol?: string } | null;
      dockerConfig: unknown;
      coresLimit: number | null;
      memLimitMb: number | null;
      gpuCount: number;
      webFilterId?: string | null;
      egressGatewayId?: string | null;
      browserIsolationId?: string | null;
    },
    protocol: 'KASMVNC' | 'RDP' | 'VNC' | 'SSH' | 'WEBRTC',
  ) {
    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) return;

    const defaults = (workspace.image?.runConfigDefaults ?? {}) as { ports?: number[] };
    const dockerCfg = (workspace.dockerConfig ?? {}) as {
      shmSize?: string;
      /** Host device paths to pass through, e.g. "/dev/video0", "/dev/bus/usb", "/dev/pcsc". */
      devices?: string[];
    };
    // Neko (WEBRTC) listens on 8080; all other images use the image's default (6901).
    const defaultPort = protocol === 'WEBRTC' ? 8080 : 6901;
    const runConfig: RunConfig = {
      dockerImage: workspace.image?.dockerImage ?? 'kasmweb/firefox:1.16.0',
      env: {},
      ports: defaults.ports ?? [defaultPort],
      shmSize: dockerCfg.shmSize ?? (protocol === 'WEBRTC' ? '2g' : '1g'),
      cores: workspace.coresLimit ?? undefined,
      memLimitMb: workspace.memLimitMb ?? undefined,
      gpuCount: workspace.gpuCount,
      ...(dockerCfg.devices?.length ? { devices: dockerCfg.devices } : {}),
    };

    // Resolve open-source sidecar descriptors from workspace connectivity policy.
    const sidecars: ProvisionCommand['sidecars'] = {};
    if (this.render) {
      if (workspace.webFilterId) {
        sidecars.squid = await this.render
          .resolveSquidSidecar(workspace.orgId, workspace.webFilterId)
          .catch(() => undefined);
      }
      if (workspace.egressGatewayId) {
        sidecars.wireguard = await this.render
          .resolveWireGuardSidecar(workspace.orgId, workspace.egressGatewayId)
          .catch(() => undefined);
      }
      if (workspace.browserIsolationId) {
        // If a Squid sidecar is present, auto-wire its hostname as the forward proxy.
        const squidUrl = workspace.webFilterId
          ? `http://chista-squid-${session.kasmId}:3128`
          : undefined;
        sidecars.neko = await this.render
          .resolveNekoSidecar(workspace.orgId, workspace.browserIsolationId, squidUrl)
          .catch(() => undefined);
      }
    }

    const command: ProvisionCommand = {
      sessionId,
      kasmId: session.kasmId,
      orgId: session.orgId,
      workspaceId: workspace.id,
      zone: zoneName,
      protocol,
      runConfig,
      ...(Object.keys(sidecars).length > 0 ? { sidecars } : {}),
    };
    await this.redis.publish(RedisChannels.provision(zoneName), command);
    await prisma.session.update({ where: { id: sessionId }, data: { status: 'PROVISIONING' } });
  }

  async list(filters: { status?: string; userId?: string } = {}) {
    return prisma.session.findMany({
      where: {
        status: filters.status ? (filters.status as never) : { notIn: ['DESTROYED'] },
        ...(filters.userId ? { userId: filters.userId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async get(id: string) {
    const session = await prisma.session.findUnique({ where: { id } });
    if (!session) throw new NotFoundException('Session not found');
    return session;
  }

  async terminate(id: string, user: AuthUser) {
    const session = await prisma.session.findUnique({ where: { id } });
    if (!session) throw new NotFoundException('Session not found');
    await this.destroy(session, 'admin_terminate', user.sub);
    return { ok: true };
  }

  /**
   * Tear down a session and notify the owning agent. Shared by admin-initiated
   * termination and the automated reaper; `actorUserId` is omitted for
   * system-initiated reasons (expiry / idle).
   */
  async destroy(
    session: { id: string; orgId: string; zoneId: string; containerId: string | null },
    reason: string,
    actorUserId?: string,
  ) {
    await prisma.session.update({
      where: { id: session.id },
      data: { status: 'TERMINATING', terminationReason: reason },
    });
    const zone = await prisma.deploymentZone.findUnique({ where: { id: session.zoneId } });
    await this.redis.publish(RedisChannels.destroy(zone?.name ?? 'default'), {
      sessionId: session.id,
      containerId: session.containerId ?? undefined,
      reason,
    });
    await this.audit.record({
      orgId: session.orgId,
      actorUserId: actorUserId ?? 'system',
      action: 'session.terminate',
      targetType: 'Session',
      targetId: session.id,
      metadata: { reason },
    });
    await this.webhooks?.dispatch(session.orgId, 'session.terminated', { sessionId: session.id, reason });
  }

  async keepalive(id: string) {
    await prisma.session.update({ where: { id }, data: { lastKeepaliveAt: new Date() } });
    return { ok: true };
  }

  async connection(id: string) {
    const session = await prisma.session.findUnique({ where: { id } });
    if (!session) throw new NotFoundException('Session not found');
    return { connectionUrl: session.connectionUrl, status: session.status };
  }
}
