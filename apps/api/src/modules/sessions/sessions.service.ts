import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import type { CreateSessionDto } from '@chista/contracts';
import { prisma } from '@chista/db';
import { type ProvisionCommand, RedisChannels, type RunConfig } from '@chista/events';
import { AuditService } from '../../common/audit.service';
import type { AuthUser } from '../../common/decorators';
import { RedisService } from '../../common/redis.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { SchedulerService } from './scheduler.service';

@Injectable()
export class SessionsService {
  constructor(
    private readonly scheduler: SchedulerService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
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
        connectionType: protocol === 'KASMVNC' ? 'KASMVNC' : 'GUAC_RDP',
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
    workspace: { id: string; image: { dockerImage: string; runConfigDefaults: unknown } | null; dockerConfig: unknown; coresLimit: number | null; memLimitMb: number | null; gpuCount: number; orgId: string },
    protocol: 'KASMVNC' | 'RDP' | 'VNC' | 'SSH',
  ) {
    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) return;

    const defaults = (workspace.image?.runConfigDefaults ?? {}) as { ports?: number[] };
    const dockerCfg = (workspace.dockerConfig ?? {}) as { shmSize?: string };
    const runConfig: RunConfig = {
      dockerImage: workspace.image?.dockerImage ?? 'kasmweb/firefox:1.16.0',
      env: {},
      ports: defaults.ports ?? [6901],
      shmSize: dockerCfg.shmSize ?? '1g',
      cores: workspace.coresLimit ?? undefined,
      memLimitMb: workspace.memLimitMb ?? undefined,
      gpuCount: workspace.gpuCount,
    };

    const command: ProvisionCommand = {
      sessionId,
      kasmId: session.kasmId,
      orgId: session.orgId,
      workspaceId: workspace.id,
      zone: zoneName,
      protocol,
      runConfig,
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
