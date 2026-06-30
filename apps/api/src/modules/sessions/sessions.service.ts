import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { CreateSessionDto } from '@asha/contracts';
import { prisma } from '@asha/db';
import {
  type DlpPolicy,
  type GpuConfig,
  type ProvisionCommand,
  RedisChannels,
  type RunConfig,
  type SessionControlCommand,
  type SessionSidecar,
  type StreamProfile,
} from '@asha/events';
import { AuditService } from '../../common/audit.service';
import type { AuthUser } from '../../common/decorators';
import { RedisService } from '../../common/redis.service';
import { resolveTokens, type TokenContext } from '../../common/tokens';
import { ConnectivityRenderService } from '../connectivity/connectivity-render.service';
import { LicensingService } from '../licensing/licensing.service';
import { ServersService } from '../servers/servers.service';
import { StorageService } from '../storage/storage.service';
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
    // Optional: when present, enabled cloud StorageMappings mount via rclone sidecars.
    @Optional() private readonly storage?: StorageService,
    // Optional: opens server-backed (RDP/VNC/SSH) sessions for non-container
    // workspaces by reusing the fixed-server connect path.
    @Optional() private readonly servers?: ServersService,
  ) {}

  async create(user: AuthUser, dto: CreateSessionDto) {
    // License gate first — refuse before we allocate any resources.
    await this.licensing?.assertCanLaunch(user.orgId, user.sub);
    // Per-group concurrency gate — refuse if the user's most restrictive group
    // cap would be exceeded, before we allocate any resources.
    await this.assertWithinGroupConcurrencyLimit(user.sub, user.orgId);

    const workspace = await prisma.workspace.findUnique({
      where: { id: dto.workspaceId },
      include: { image: true },
    });
    if (!workspace || !workspace.enabled) throw new NotFoundException('Workspace not available');

    // Server-backed workspaces (Windows desktops, etc.) connect to a fixed
    // RDP/VNC/SSH host via the connection-proxy — NOT a container. Reuse the
    // server connect path so "launch from My Workspace" behaves like a Static
    // Server. (A missing type is legacy = container.)
    if (workspace.type && workspace.type !== 'CONTAINER') {
      if (!workspace.serverId) {
        throw new BadRequestException('This workspace has no server configured. Edit it and choose a server.');
      }
      if (!this.servers) throw new BadRequestException('Server connections are unavailable.');
      const conn = await this.servers.connect(user, workspace.serverId);
      await this.webhooks?.dispatch(user.orgId, 'session.created', {
        sessionId: conn.sessionId,
        workspaceId: workspace.id,
        userId: user.sub,
      });
      return prisma.session.findUnique({ where: { id: conn.sessionId } });
    }

    // Zone precedence: explicit request → the workspace's preferred zone → a zone
    // that currently has a LIVE agent → the org default → any zone. Every lookup
    // is scoped to the launching user's org (tenant isolation) so a launch can
    // never resolve to another org's — or a stale/junk — zone.
    //
    // Preferring a zone with a live agent is what stops the recurring failure:
    // historically a workspace with no explicit zone fell back to whichever zone
    // was flagged `isDefault`, and if an admin (or a bad seed) left that flag on a
    // zone with no online agent, the session was created there, no agent ever
    // picked it up, and it silently sat until the reaper failed it with the
    // opaque "Launch timed out before the workspace became ready".
    const orgId = user.orgId;
    const zonePref = dto.zoneId ?? workspace.zoneId ?? null;
    const zone =
      (zonePref
        ? await prisma.deploymentZone.findFirst({ where: { id: zonePref, orgId } })
        : ((await this.scheduler.pickZoneWithLiveAgent(orgId)) ??
          (await prisma.deploymentZone.findFirst({ where: { orgId, isDefault: true } })))) ??
      (await prisma.deploymentZone.findFirst({ where: { orgId } }));
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
      // The scheduler may spill over to another zone (cross-zone fallback) when
      // the requested zone has no fresh agent with spare capacity. An agent only
      // subscribes to ITS OWN zone's Redis channels, so we MUST align the session
      // and the provision/destroy/control channel to the chosen agent's zone —
      // otherwise the provision command is published to `provision(<requested
      // zone>)`, which no agent is listening on, and the launch hangs until the
      // reaper fails it ("Launch timed out before the workspace became ready").
      let provisionZoneName = zone.name;
      const scheduleData: { status: 'SCHEDULED'; agentId: string; zoneId?: string } = {
        status: 'SCHEDULED',
        agentId: agent.id,
      };
      if (agent.zoneId && agent.zoneId !== zone.id) {
        const agentZone = await prisma.deploymentZone.findUnique({
          where: { id: agent.zoneId },
          select: { name: true },
        });
        if (agentZone) {
          provisionZoneName = agentZone.name;
          scheduleData.zoneId = agent.zoneId;
        }
      }
      await prisma.session.update({ where: { id: session.id }, data: scheduleData });
      const tokenCtx: TokenContext = {
        username: user.email.split('@')[0],
        email: user.email,
        customAttributes: (dto.launchValues ?? {}) as Record<string, unknown>,
      };
      await this.dispatchProvision(session.id, provisionZoneName, workspace, protocol, tokenCtx, user.sub);
    } else {
      // No ONLINE agent in ANY of the org's zones could take this session. Fail
      // LOUDLY and immediately instead of leaving it REQUESTED to time out after
      // minutes with the opaque "Launch timed out before the workspace became
      // ready": mark it ERROR with an actionable reason and surface a 503 so the
      // user — and the UI — know exactly what's wrong and what to do.
      const reason =
        'No deployment agent is online to run this workspace. Ask an administrator to ' +
        'check that an agent is connected and healthy, then launch again.';
      await prisma.session.update({
        where: { id: session.id },
        data: { status: 'ERROR', errorMessage: reason },
      });
      await this.audit.record({
        orgId: user.orgId,
        actorUserId: user.sub,
        action: 'session.create',
        targetType: 'Session',
        targetId: session.id,
        metadata: { workspace: workspace.name, outcome: 'no-agent-available' },
      });
      throw new ServiceUnavailableException(reason);
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

  /**
   * Enforce the launching user's GROUP-level `maxConcurrentSessions` cap. A user
   * may belong to several groups; the effective limit is the MOST RESTRICTIVE
   * (minimum) positive `maxConcurrentSessions` across their memberships. If no
   * group sets a positive limit, there is no group cap and the check is skipped
   * (the API only accepts positive/null, so a stray 0 from a direct DB write is
   * treated as "no cap" rather than a permanent lockout). The per-org license
   * cap is enforced separately in `create()`.
   */
  private async assertWithinGroupConcurrencyLimit(userId: string, orgId: string) {
    const memberships = await prisma.userGroup.findMany({
      where: { userId, orgId },
      select: { group: { select: { maxConcurrentSessions: true } } },
    });
    const limits = memberships
      .map((m) => m.group?.maxConcurrentSessions)
      .filter((v): v is number => typeof v === 'number' && v > 0);
    if (limits.length === 0) return; // no group sets a cap → no group-level limit

    const effectiveLimit = Math.min(...limits);
    // Scope the count by orgId too — matches the licensing service convention and
    // is correct even if a user identity ever spans tenants.
    const activeCount = await prisma.session.count({
      where: { orgId, userId, status: { notIn: ['DESTROYED', 'TERMINATING', 'ERROR'] } },
    });
    if (activeCount >= effectiveLimit) {
      throw new ForbiddenException(
        `Concurrent session limit reached: your group allows at most ${effectiveLimit} active session${effectiveLimit === 1 ? '' : 's'}.`,
      );
    }
  }

  /** Build rclone mount sidecars from the org's enabled cloud StorageMappings (E2). */
  private async resolveStorageSidecars(orgId: string, tokenCtx: TokenContext): Promise<SessionSidecar[]> {
    if (!this.storage) return [];
    const typeByKind: Record<string, string> = {
      S3: 's3',
      DROPBOX: 'dropbox',
      GDRIVE: 'drive',
      NEXTCLOUD: 'webdav',
      ONEDRIVE: 'onedrive',
    };
    const mappings = await prisma.storageMapping.findMany({ where: { orgId, enabled: true } });
    const sidecars: SessionSidecar[] = [];
    for (const m of mappings) {
      const cfg = ((await this.storage.resolveStorageConfig(orgId, m.id)) ?? {}) as Record<string, unknown>;
      const type = typeByKind[m.kind] ?? String(cfg.type ?? '');
      if (!type) continue;
      // rclone reads RCLONE_CONFIG_<REMOTE>_<KEY> env to define remote "REMOTE".
      const env: Record<string, string> = { RCLONE_CONFIG_REMOTE_TYPE: type };
      for (const [k, v] of Object.entries(cfg)) {
        if (v == null || typeof v === 'object') continue;
        if (['bucket', 'path', 'remotePath', 'type'].includes(k)) continue;
        env[`RCLONE_CONFIG_REMOTE_${k.toUpperCase()}`] = String(v);
      }
      const sub = String(cfg.bucket ?? cfg.path ?? cfg.remotePath ?? '');
      const mountPath = resolveTokens({ p: m.mountPath }, tokenCtx).p;
      sidecars.push({
        image: process.env.ASHA_RCLONE_IMAGE ?? 'rclone/rclone:latest',
        env,
        cmd: ['mount', `REMOTE:${sub}`, mountPath, '--allow-other', '--vfs-cache-mode', 'writes', '--no-modtime'],
        capAdd: ['SYS_ADMIN'],
        devices: ['/dev/fuse'],
      });
    }
    return sidecars;
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
    userId: string,
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
    // E1/E4: propagate admin-defined host volume + file mappings into the session.
    // hostPath/sourcePath/destPath support {username}/{email}/{custom_attribute_*} tokens.
    const [volumeMappings, fileMappings] = await Promise.all([
      prisma.volumeMapping.findMany({ where: { orgId: workspace.orgId } }),
      // E3: org-wide (userId null) + user-scoped file mappings for the launching user.
      prisma.fileMapping.findMany({
        where: { orgId: workspace.orgId, target: 'CONTAINER', OR: [{ userId: null }, { userId }] },
      }),
    ]);
    const storageVolumes = [
      ...volumeMappings.map((m) => {
        const i = resolveTokens({ s: m.hostPath, t: m.destPath }, tokenCtx);
        return { source: i.s, target: i.t, readOnly: m.readOnly };
      }),
      // E4: a file mapping binds one host file → container path; home-profile files
      // are writable, everything else is mounted read-only.
      ...fileMappings.map((m) => {
        const i = resolveTokens({ s: m.sourcePath, t: m.destPath }, tokenCtx);
        return { source: i.s, target: i.t, readOnly: !m.isHomeProfile };
      }),
    ];
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
      ...(storageVolumes.length ? { volumes: storageVolumes } : {}),
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
          ? `http://asha-squid-${session.kasmId}:3128`
          : undefined;
        sidecars.neko = await this.render
          .resolveNekoSidecar(workspace.orgId, workspace.browserIsolationId, squidUrl)
          .catch(() => undefined);
      }
      // DLP-gated capability sidecars (open-source PulseAudio / CUPS).
      if (dlp.audioOut) sidecars.audio = this.render.resolveAudioSidecar(dockerCfg.audioImage);
      if (dlp.printing) sidecars.printing = this.render.resolvePrintingSidecar(dockerCfg.printerImage);
    }
    // E2: mount the org's enabled cloud StorageMappings via rclone sidecars.
    const storageSidecars = await this.resolveStorageSidecars(workspace.orgId, tokenCtx);
    if (storageSidecars.length) sidecars.storage = storageSidecars;

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
    const published = await this.redis.publish(RedisChannels.provision(zoneName), command);
    if (!published) {
      // The message bus is down — the agent will NEVER receive this command.
      // Fail loudly now so the caller gets a 503 instead of the session sitting
      // in SCHEDULED until the launch-timeout reaper fails it minutes later.
      await prisma.session.update({
        where: { id: sessionId },
        data: {
          status: 'ERROR',
          errorMessage: 'Provisioning is temporarily unavailable (message bus down). Please try again shortly.',
        },
      });
      throw new ServiceUnavailableException('Provisioning is temporarily unavailable. Please try again shortly.');
    }
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
   *
   * If there is a running container on a live agent, the session goes to
   * TERMINATING and waits for that agent to actually stop+remove the container
   * and ack DESTROYED. If there is nothing to tear down — no container was ever
   * provisioned, or the assigned agent is offline and will never receive the
   * destroy event — the session is finalized to DESTROYED immediately so it
   * doesn't linger in TERMINATING forever (and pile up in the sessions list).
   */
  async destroy(
    session: { id: string; orgId: string; zoneId: string; containerId: string | null; kasmId?: string; agentId?: string | null },
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

    // Decide whether a live agent will actually process the destroy event. If
    // not, finalize now — otherwise the session is stuck in TERMINATING with no
    // one to ack it. A null containerId means no container was ever started; an
    // offline/absent agent means the published event falls on deaf ears.
    const agentLive = session.agentId
      ? await prisma.agent.findFirst({ where: { id: session.agentId, status: 'ONLINE' }, select: { id: true } })
      : null;
    if (!session.containerId || !agentLive) {
      await this.finalizeDestroyed(session);
    }
  }

  /**
   * Move a session into the terminal DESTROYED state and run the same cleanup
   * an agent's DESTROYED ack would: release the scheduler slot it held and drop
   * the proxy cache entry. Used when no agent will tear the session down (see
   * `destroy`) and by the reaper backstop for sessions stuck in TERMINATING.
   * Idempotent — a no-op once the row is already DESTROYED.
   */
  async finalizeDestroyed(session: { id: string; kasmId?: string; agentId?: string | null }) {
    const { count } = await prisma.session.updateMany({
      where: { id: session.id, status: { not: 'DESTROYED' } },
      data: { status: 'DESTROYED', destroyedAt: new Date() },
    });
    if (count === 0) return;
    if (session.agentId) {
      await prisma.agent.updateMany({
        where: { id: session.agentId, currentSessions: { gt: 0 } },
        data: { currentSessions: { decrement: 1 } },
      });
    }
    if (session.kasmId) {
      // NB: the key prefix is `asha:` — it MUST match what the agent/servers
      // write and the connection-proxy reads (see agents.service / session-store).
      // A stale `chista:` prefix here meant terminated sessions' proxy records
      // were never deleted and lingered until their TTL.
      await this.redis.del(`asha:proxy:session:${session.kasmId}`).catch(() => undefined);
    }
  }

  /**
   * Fail a launch that never reached RUNNING within the launch timeout. Marks
   * the session ERROR with a reason so the viewer can show a clear failure
   * instead of spinning forever (no agent available, slow image pull on a weak
   * link, or an agent that never reported back). Idempotent: only a session
   * still in a pre-RUNNING state transitions. A container is only torn down if
   * one was actually started — we never blindly destroy.
   */
  async failStuckLaunch(
    session: { id: string; orgId: string; zoneId: string; containerId: string | null },
    reason = 'launch_timeout',
  ) {
    const { count } = await prisma.session.updateMany({
      where: { id: session.id, status: { in: ['REQUESTED', 'SCHEDULED', 'PROVISIONING'] } },
      data: {
        status: 'ERROR',
        terminationReason: reason,
        errorMessage: 'Launch timed out before the workspace became ready.',
      },
    });
    if (count === 0) return; // already RUNNING / terminal — nothing to fail
    if (session.containerId) {
      const zone = await prisma.deploymentZone.findUnique({ where: { id: session.zoneId } });
      await this.redis.publish(RedisChannels.destroy(zone?.name ?? 'default'), {
        sessionId: session.id,
        containerId: session.containerId,
        reason,
      });
    }
    await this.audit.record({
      orgId: session.orgId,
      actorUserId: 'system',
      action: 'session.launch_timeout',
      targetType: 'Session',
      targetId: session.id,
      metadata: { reason },
    });
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
      // Populated when a launch failed/timed out so the viewer can show the
      // reason instead of a generic disconnect.
      errorMessage: session.errorMessage ?? null,
      // The viewer reads the DLP policy back to grey out disallowed controls.
      dlp: (workspace?.dlp ?? {}) as DlpPolicy,
      // The viewer applies the stream profile client-side (KasmVNC quality/fps/clipboard).
      streamProfile: (session.streamProfile ?? {}) as unknown as StreamProfile,
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

  /** Apply a live stream-control profile (fps/quality/bitrate/clipboard) — merged, persisted, pushed. */
  async setStreamProfile(id: string, profile: StreamProfile, user: AuthUser) {
    const session = await this.requireControllable(id, ['RUNNING', 'DEGRADED'], user);
    const merged: StreamProfile = {
      ...((session.streamProfile ?? {}) as unknown as StreamProfile),
      ...profile,
    };
    await prisma.session.update({ where: { id }, data: { streamProfile: merged as object } });
    await this.sendControl(session, { action: 'STREAM', streamProfile: merged });
    await this.audit.record({
      orgId: session.orgId,
      actorUserId: user.sub,
      action: 'session.stream',
      targetType: 'Session',
      targetId: id,
      metadata: merged as unknown as Record<string, unknown>,
    });
    return { ok: true, streamProfile: merged };
  }

  /** Begin (or restart) recording a running session. Lifecycle tracked in Recording. */
  async startRecording(id: string, user: AuthUser) {
    const session = await this.requireControllable(id, ['RUNNING', 'DEGRADED'], user);
    const existing = await prisma.recording.findUnique({ where: { sessionId: id } });
    if (existing?.status === 'RECORDING') throw new BadRequestException('Recording already in progress');
    const proto: Record<string, 'KASMVNC' | 'RDP' | 'VNC' | 'SSH' | 'WEBRTC'> = {
      KASMVNC: 'KASMVNC',
      NEKO_WEBRTC: 'WEBRTC',
      GUAC_RDP: 'RDP',
      GUAC_VNC: 'VNC',
      GUAC_SSH: 'SSH',
    };
    const protocol = proto[session.connectionType] ?? 'KASMVNC';
    const recording = existing
      ? await prisma.recording.update({
          where: { sessionId: id },
          data: { status: 'RECORDING', protocol, startedAt: new Date(), finalizedAt: null, durationSec: 0 },
        })
      : await prisma.recording.create({
          data: { orgId: session.orgId, sessionId: id, protocol, status: 'RECORDING' },
        });
    await prisma.session.update({ where: { id }, data: { recordingEnabled: true } });
    await this.sendControl(session, { action: 'RECORD_START', recordingId: recording.id });
    await this.audit.record({
      orgId: session.orgId,
      actorUserId: user.sub,
      action: 'session.record.start',
      targetType: 'Session',
      targetId: id,
      metadata: { recordingId: recording.id },
    });
    return recording;
  }

  /** Stop recording; finalize duration + status. */
  async stopRecording(id: string, user: AuthUser) {
    const session = await this.requireControllable(id, ['RUNNING', 'DEGRADED'], user);
    const rec = await prisma.recording.findUnique({ where: { sessionId: id } });
    if (!rec || rec.status !== 'RECORDING') throw new BadRequestException('No active recording');
    const durationSec = Math.max(0, Math.round((Date.now() - rec.startedAt.getTime()) / 1000));
    const updated = await prisma.recording.update({
      where: { sessionId: id },
      data: { status: 'AVAILABLE', finalizedAt: new Date(), durationSec },
    });
    await prisma.session.update({ where: { id }, data: { recordingEnabled: false } });
    await this.sendControl(session, { action: 'RECORD_STOP', recordingId: rec.id });
    await this.audit.record({
      orgId: session.orgId,
      actorUserId: user.sub,
      action: 'session.record.stop',
      targetType: 'Session',
      targetId: id,
      metadata: { recordingId: rec.id, durationSec },
    });
    return updated;
  }

  /** Recording metadata + artifacts for a session. */
  async getRecording(id: string, user: AuthUser) {
    const session = await this.findInOrg(id, user.orgId);
    this.assertCanAccess(session, user);
    return prisma.recording.findUnique({ where: { sessionId: id }, include: { artifacts: true } });
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
  // kasmweb images gate the in-image services on KASM_SVC_* env names (each
  // `${…:-1}`); the previous KASM_UPLOADS/KASM_PRINTING/KASM_AUDIO_INPUT/KASM_AUDIO
  // names were no-ops, so a `false` DLP policy never actually disabled the
  // service. Use the real service-env names so the toggles take effect.
  if (deny(dlp.uploads)) env.KASM_SVC_UPLOADS = '0';
  if (deny(dlp.downloads)) env.KASM_SVC_DOWNLOADS = '0';
  if (deny(dlp.printing)) env.KASM_SVC_PRINTER = '0';
  if (deny(dlp.audioIn)) env.KASM_SVC_AUDIO_INPUT = '0';
  if (deny(dlp.audioOut)) env.KASM_SVC_AUDIO = '0';
  if (deny(dlp.pwa)) env.KASM_PWA = '0';

  // Geometric / advanced DLP — honoured by DLP-capable KasmVNC builds
  // (ASHA_DLP_ENABLED images, see infra/workstation).
  if (dlp.watermark?.text) {
    env.KASM_DLP_WATERMARK_TEXT = dlp.watermark.text;
    if (dlp.watermark.opacity !== undefined) env.KASM_DLP_WATERMARK_OPACITY = String(dlp.watermark.opacity);
    env.KASM_DLP_WATERMARK_TILE = dlp.watermark.tile ? '1' : '0';
  }
  if (dlp.clipboardMaxBytes !== undefined) env.KASM_DLP_CLIPBOARD_MAX_BYTES = String(dlp.clipboardMaxBytes);
  if (dlp.clipboardAllowMimeTypes?.length) env.KASM_DLP_CLIPBOARD_MIME = dlp.clipboardAllowMimeTypes.join(',');
  if (dlp.keyboardRateLimit !== undefined) env.KASM_DLP_KEYBOARD_RATE = String(dlp.keyboardRateLimit);
  if (dlp.failSecure) env.KASM_DLP_FAIL_SECURE = '1';
  return env;
}
