import { BadRequestException, ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import type { CreateSessionDto } from '@chista/contracts';
import { prisma } from '@chista/db';
import {
  type DlpPolicy,
  type GpuConfig,
  type ProvisionCommand,
  RedisChannels,
  type RunConfig,
  type SessionControlCommand,
} from '@chista/events';
import { AuditService } from '../../common/audit.service';
import type { AuthUser } from '../../common/decorators';
import { RedisService } from '../../common/redis.service';
import { resolveTokens, type TokenContext } from '../../common/tokens';
import { ConnectivityRenderService } from '../connectivity/connectivity-render.service';
import { LicensingService } from '../licensing/licensing.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { SchedulerService } from './scheduler.service';

const SESSION_STATUSES = new Set([
  'REQUESTED', 'SCHEDULED', 'PROVISIONING', 'RUNNING', 'DEGRADED', 'PAUSED', 'TERMINATING', 'DESTROYED', 'ERROR',
]);

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
    // Optional so unit tests can construct the service without licensing;
    // when present, the per-org session cap is enforced before launch.
    @Optional() private readonly licensing?: LicensingService,
  ) {}

  async create(user: AuthUser, dto: CreateSessionDto) {
    // License gate first — refuse before we allocate any resources.
    await this.licensing?.assertCanLaunch(user.orgId, user.sub);

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
      const tokenCtx: TokenContext = {
        username: user.email.split('@')[0],
        email: user.email,
        customAttributes: (dto.launchValues ?? {}) as Record<string, unknown>,
      };
      await this.dispatchProvision(session.id, zone.name, workspace, protocol, tokenCtx);
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
      gpu?: unknown;
      dlp?: unknown;
      webFilterId?: string | null;
      egressGatewayId?: string | null;
      browserIsolationId?: string | null;
    },
    protocol: 'KASMVNC' | 'RDP' | 'VNC' | 'SSH' | 'WEBRTC',
    tokenCtx: TokenContext,
  ) {
    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) return;

    const defaults = (workspace.image?.runConfigDefaults ?? {}) as { ports?: number[] };
    const dockerCfg = (workspace.dockerConfig ?? {}) as {
      shmSize?: string;
      /** Host device paths to pass through, e.g. "/dev/video0", "/dev/bus/usb", "/dev/pcsc". */
      devices?: string[];
      audioImage?: string;
      printerImage?: string;
      env?: Record<string, string>;
      labels?: Record<string, string>;
      capAdd?: string[];
      capDrop?: string[];
      securityOpt?: string[];
      privileged?: boolean;
      restartPolicy?: 'no' | 'always' | 'unless-stopped' | 'on-failure';
    };
    const gpu = (workspace.gpu ?? {}) as GpuConfig;
    const dlp = (workspace.dlp ?? {}) as DlpPolicy;
    // Neko (WEBRTC) listens on 8080; all other images use the image's default (6901).
    const defaultPort = protocol === 'WEBRTC' ? 8080 : 6901;
    // Admin-defined container env + labels are token-interpolated against the
    // launching user ({username}, {email}, {custom_attribute_*}).
    const customEnv = resolveTokens(dockerCfg.env ?? {}, tokenCtx);
    const customLabels = resolveTokens(dockerCfg.labels ?? {}, tokenCtx);
    const runConfig: RunConfig = {
      dockerImage: workspace.image?.dockerImage ?? 'kasmweb/firefox:1.16.0',
      // DLP flags are surfaced to KasmVNC/Neko as env vars the image honours;
      // admin env layers on top (DLP wins on key collisions for safety).
      env: { ...customEnv, ...dlpEnv(dlp) },
      ports: defaults.ports ?? [defaultPort],
      shmSize: dockerCfg.shmSize ?? (protocol === 'WEBRTC' ? '2g' : '1g'),
      cores: workspace.coresLimit ?? undefined,
      memLimitMb: workspace.memLimitMb ?? undefined,
      gpuCount: gpu.count ?? workspace.gpuCount,
      ...(gpu.encoder && gpu.encoder !== 'none' ? { gpu } : {}),
      ...(dockerCfg.devices?.length ? { devices: dockerCfg.devices } : {}),
      ...(Object.keys(customLabels).length ? { labels: customLabels } : {}),
      ...(dockerCfg.capAdd?.length ? { capAdd: dockerCfg.capAdd } : {}),
      ...(dockerCfg.capDrop?.length ? { capDrop: dockerCfg.capDrop } : {}),
      ...(dockerCfg.securityOpt?.length ? { securityOpt: dockerCfg.securityOpt } : {}),
      ...(dockerCfg.privileged ? { privileged: true } : {}),
      ...(dockerCfg.restartPolicy ? { restartPolicy: dockerCfg.restartPolicy } : {}),
    };

    // Resolve open-source sidecar descriptors from workspace connectivity policy.
    const sidecars: NonNullable<ProvisionCommand['sidecars']> = {};
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
      // DLP-gated capability sidecars (open-source PulseAudio / CUPS).
      if (dlp.audioOut) sidecars.audio = this.render.resolveAudioSidecar(dockerCfg.audioImage);
      if (dlp.printing) sidecars.printing = this.render.resolvePrintingSidecar(dockerCfg.printerImage);
    }

    const command: ProvisionCommand = {
      sessionId,
      kasmId: session.kasmId,
      orgId: session.orgId,
      workspaceId: workspace.id,
      zone: zoneName,
      protocol,
      runConfig,
      ...(Object.keys(dlp).length > 0 ? { dlp } : {}),
      ...(Object.keys(sidecars).length > 0 ? { sidecars } : {}),
    };
    await this.redis.publish(RedisChannels.provision(zoneName), command);
    await prisma.session.update({ where: { id: sessionId }, data: { status: 'PROVISIONING' } });
  }

  async list(filters: { status?: string; userId?: string } = {}) {
    // Validate the caller-supplied status against the enum; an unknown value
    // would otherwise reach Prisma as an invalid enum and 500. Fall back to the
    // default "everything except DESTROYED" filter.
    const statusFilter = filters.status && SESSION_STATUSES.has(filters.status) ? filters.status : undefined;
    return prisma.session.findMany({
      where: {
        status: statusFilter ? (statusFilter as never) : { notIn: ['DESTROYED'] },
        ...(filters.userId ? { userId: filters.userId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async get(id: string, user: AuthUser) {
    return this.findInOrg(id, user.orgId);
  }

  /** Load a session scoped to the caller's org — enforces tenant isolation. */
  private async findInOrg(id: string, orgId: string) {
    const session = await prisma.session.findFirst({ where: { id, orgId } });
    if (!session) throw new NotFoundException('Session not found');
    return session;
  }

  /**
   * Gate per-session access: the owning user or a system admin may proceed;
   * anyone else is forbidden. Closes the leak where any authenticated user
   * could read another user's connection URL / control their session by id.
   */
  private assertCanAccess(session: { userId: string | null }, user: AuthUser) {
    if (user.isSystemAdmin) return;
    if (session.userId && session.userId === user.sub) return;
    throw new ForbiddenException('You do not have access to this session');
  }

  async terminate(id: string, user: AuthUser) {
    const session = await this.findInOrg(id, user.orgId);
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
    // Idempotent: only the first transition into TERMINATING proceeds, so two
    // reaper passes (expired + paused) can't double-destroy / double-audit.
    const { count } = await prisma.session.updateMany({
      where: { id: session.id, status: { notIn: ['TERMINATING', 'DESTROYED'] } },
      data: { status: 'TERMINATING', terminationReason: reason },
    });
    if (count === 0) return;
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

  async keepalive(id: string, user: AuthUser) {
    const session = await this.findInOrg(id, user.orgId);
    this.assertCanAccess(session, user);
    await prisma.session.update({ where: { id: session.id }, data: { lastKeepaliveAt: new Date() } });
    return { ok: true };
  }

  async connection(id: string, user: AuthUser) {
    const session = await this.findInOrg(id, user.orgId);
    this.assertCanAccess(session, user);
    const workspace = session.workspaceId
      ? await prisma.workspace.findUnique({ where: { id: session.workspaceId } })
      : null;
    return {
      connectionUrl: session.connectionUrl,
      status: session.status,
      // The viewer reads the DLP policy back to grey out disallowed controls.
      dlp: (workspace?.dlp ?? {}) as DlpPolicy,
    };
  }

  /** Freeze a running session's container (no compute, state retained). */
  async pause(id: string, user: AuthUser) {
    const session = await this.requireControllable(id, ['RUNNING', 'DEGRADED'], user);
    await this.sendControl(session, { action: 'PAUSE' });
    await prisma.session.update({ where: { id }, data: { status: 'PAUSED', pausedAt: new Date() } });
    await this.audit.record({
      orgId: session.orgId,
      actorUserId: user.sub,
      action: 'session.pause',
      targetType: 'Session',
      targetId: id,
      metadata: {},
    });
    await this.webhooks?.dispatch(session.orgId, 'session.paused', { sessionId: id });
    return { ok: true };
  }

  /** Thaw a paused session's container. */
  async resume(id: string, user: AuthUser) {
    const session = await this.requireControllable(id, ['PAUSED'], user);
    await this.sendControl(session, { action: 'RESUME' });
    await prisma.session.update({
      where: { id },
      data: { status: 'RUNNING', lastKeepaliveAt: new Date(), pausedAt: null },
    });
    await this.audit.record({
      orgId: session.orgId,
      actorUserId: user.sub,
      action: 'session.resume',
      targetType: 'Session',
      targetId: id,
      metadata: {},
    });
    await this.webhooks?.dispatch(session.orgId, 'session.resumed', { sessionId: id });
    return { ok: true };
  }

  /** Request a screen-geometry change for multi-monitor / responsive layouts. */
  async resize(id: string, width: number, height: number, user: AuthUser) {
    const session = await this.requireControllable(id, ['RUNNING', 'DEGRADED'], user);
    await this.sendControl(session, { action: 'RESIZE', width, height });
    return { ok: true };
  }

  private async requireControllable(id: string, allowed: string[], user: AuthUser) {
    const session = await this.findInOrg(id, user.orgId);
    this.assertCanAccess(session, user);
    if (!allowed.includes(session.status)) {
      throw new BadRequestException(`Session is ${session.status}; expected one of ${allowed.join(', ')}`);
    }
    return session;
  }

  private async sendControl(
    session: { id: string; zoneId: string; containerId: string | null },
    partial: Omit<SessionControlCommand, 'sessionId' | 'containerId'>,
  ) {
    const zone = await prisma.deploymentZone.findUnique({ where: { id: session.zoneId } });
    const command: SessionControlCommand = {
      sessionId: session.id,
      containerId: session.containerId ?? undefined,
      ...partial,
    };
    await this.redis.publish(RedisChannels.control(zone?.name ?? 'default'), command);
  }
}

/**
 * Translate a DLP policy into container env vars. KasmVNC and Neko both read
 * these to enable/disable clipboard, upload/download, audio and printing. A
 * flag that is explicitly false disables the feature; absent leaves the image
 * default. We only emit the restrictive ("0") values so permissive defaults
 * still work for workspaces with no DLP policy.
 */
function dlpEnv(dlp: DlpPolicy): Record<string, string> {
  const env: Record<string, string> = {};
  const deny = (flag: boolean | undefined) => flag === false;
  if (deny(dlp.clipboardUp)) env.KASM_CLIPBOARD_UP = '0';
  if (deny(dlp.clipboardDown)) env.KASM_CLIPBOARD_DOWN = '0';
  if (deny(dlp.uploads)) env.KASM_UPLOADS = '0';
  if (deny(dlp.downloads)) env.KASM_DOWNLOADS = '0';
  if (deny(dlp.printing)) env.KASM_PRINTING = '0';
  if (deny(dlp.audioIn)) env.KASM_AUDIO_INPUT = '0';
  if (deny(dlp.audioOut)) env.KASM_AUDIO = '0';
  if (deny(dlp.pwa)) env.KASM_PWA = '0';
  return env;
}
