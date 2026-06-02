import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { CreateSessionDto } from '@chista/contracts';
import { prisma } from '@chista/db';
import { type ProvisionCommand, RedisChannels, type RunConfig } from '@chista/events';
import { AuditService } from '../../common/audit.service';
import type { AuthUser } from '../../common/decorators';
import { RedisService } from '../../common/redis.service';
import { SchedulerService } from './scheduler.service';

@Injectable()
export class SessionsService {
  constructor(
    private readonly scheduler: SchedulerService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
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

    await prisma.session.update({ where: { id }, data: { status: 'TERMINATING' } });
    const zone = await prisma.deploymentZone.findUnique({ where: { id: session.zoneId } });
    await this.redis.publish(RedisChannels.destroy(zone?.name ?? 'default'), {
      sessionId: id,
      containerId: session.containerId ?? undefined,
      reason: 'admin_terminate',
    });
    await this.audit.record({
      orgId: user.orgId,
      actorUserId: user.sub,
      action: 'session.terminate',
      targetType: 'Session',
      targetId: id,
    });
    return { ok: true };
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
