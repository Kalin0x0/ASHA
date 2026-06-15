import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Env } from '@chista/config';
import type { CreateServerDto, UpdateServerDto } from '@chista/contracts';
import { prisma } from '@chista/db';
import { sessionConnectionUrl } from '@chista/proxy-labels';
import { AuditService } from '../../common/audit.service';
import { mergeSealedConfig, sealConfig, unsealConfig } from '../../common/config-seal';
import type { AuthUser } from '../../common/decorators';
import { ENV } from '../../common/env.module';
import { RedisService } from '../../common/redis.service';
import { buildRdpFile, type RdpFileOptions } from './rdp-file';

/** Fixed-server connection type → the session's stored ConnectionType. */
const CONN_BY_SERVER: Record<string, 'GUAC_RDP' | 'GUAC_VNC' | 'GUAC_SSH'> = {
  RDP: 'GUAC_RDP',
  VNC: 'GUAC_VNC',
  SSH: 'GUAC_SSH',
};
const PORT_BY_SERVER: Record<string, number> = { RDP: 3389, VNC: 5900, SSH: 22 };

/**
 * Servers: persistent RDP/VNC/SSH hosts ("fixed infrastructure"), as opposed to
 * ephemeral containers. Credentials are sealed (AES-256-GCM) into credentialRef.
 * `connect()` opens a browser session that the connection-proxy bridges to guacd.
 */
@Injectable()
export class ServersService {
  constructor(
    private readonly audit: AuditService,
    private readonly jwt: JwtService,
    private readonly redis: RedisService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  list(orgId: string) {
    return prisma.server.findMany({
      where: { orgId },
      orderBy: { hostname: 'asc' },
      include: { zone: { select: { id: true, name: true } } },
    });
  }

  async create(orgId: string, actorUserId: string, dto: CreateServerDto) {
    const zone = await prisma.deploymentZone.findFirst({ where: { id: dto.zoneId, orgId } });
    if (!zone) throw new NotFoundException('Zone not found');

    const created = await prisma.server.create({
      data: {
        orgId,
        zoneId: dto.zoneId,
        hostname: dto.hostname,
        address: dto.address,
        connectionType: dto.connectionType,
        authMode: dto.authMode,
        continuity: dto.continuity,
        vmTemplate: dto.vmTemplate,
        vmProviderId: dto.vmProviderId,
        maxSessions: dto.maxSessions,
        ...(dto.username || dto.password || dto.security
          ? {
              credentialRef: sealConfig(
                { username: dto.username, password: dto.password, security: dto.security },
                this.env.SECRET_SEAL_KEY,
              ),
            }
          : {}),
      },
    });
    await this.audit.record({
      orgId,
      actorUserId,
      action: 'server.create',
      targetType: 'Server',
      targetId: created.id,
    });
    return created;
  }

  async update(orgId: string, actorUserId: string, id: string, dto: UpdateServerDto) {
    const existing = await prisma.server.findFirst({ where: { id, orgId } });
    if (!existing) throw new NotFoundException('Server not found');

    let credentialRef: string | undefined;
    if (dto.username !== undefined || dto.password !== undefined || dto.security !== undefined) {
      const prev = existing.credentialRef ? unsealConfig(existing.credentialRef, this.env.SECRET_SEAL_KEY) : {};
      const merged = mergeSealedConfig(prev, {
        ...(dto.username !== undefined ? { username: dto.username } : {}),
        ...(dto.password !== undefined ? { password: dto.password } : {}),
        ...(dto.security !== undefined ? { security: dto.security } : {}),
      });
      credentialRef = sealConfig(merged, this.env.SECRET_SEAL_KEY);
    }

    await prisma.server.updateMany({
      where: { id, orgId },
      data: {
        address: dto.address,
        connectionType: dto.connectionType,
        authMode: dto.authMode,
        continuity: dto.continuity,
        vmTemplate: dto.vmTemplate,
        vmProviderId: dto.vmProviderId,
        maxSessions: dto.maxSessions,
        ...(credentialRef ? { credentialRef } : {}),
      },
    });
    await this.audit.record({
      orgId,
      actorUserId,
      action: 'server.update',
      targetType: 'Server',
      targetId: id,
    });
    return prisma.server.findFirst({ where: { id, orgId } });
  }

  async remove(orgId: string, actorUserId: string, id: string) {
    const res = await prisma.server.deleteMany({ where: { id, orgId } });
    if (res.count === 0) throw new NotFoundException('Server not found');
    await this.audit.record({
      orgId,
      actorUserId,
      action: 'server.delete',
      targetType: 'Server',
      targetId: id,
    });
    return { ok: true };
  }

  /**
   * Open a browser session against a fixed (non-container) server: create a
   * RUNNING session, publish the proxy connection record (so the guacd bridge
   * reaches the host with the sealed creds), and return the connection URL.
   * No agent / container is involved.
   */
  async connect(user: AuthUser, id: string) {
    const server = await prisma.server.findFirst({ where: { id, orgId: user.orgId }, include: { zone: true } });
    if (!server) throw new NotFoundException('Server not found');

    const creds = server.credentialRef
      ? (unsealConfig(server.credentialRef, this.env.SECRET_SEAL_KEY) as {
          username?: string;
          password?: string;
          security?: string;
        })
      : {};
    const connectionType = CONN_BY_SERVER[server.connectionType] ?? 'GUAC_RDP';
    const port = PORT_BY_SERVER[server.connectionType] ?? 3389;

    const session = await prisma.session.create({
      data: {
        orgId: user.orgId,
        userId: user.sub,
        serverId: server.id,
        zoneId: server.zoneId,
        connectionType,
        status: 'RUNNING',
        workspaceName: server.hostname,
        host: server.address,
        internalHost: server.address,
        port,
        startedAt: new Date(),
        lastKeepaliveAt: new Date(),
      },
    });

    const token = await this.jwt.signAsync(
      { sid: session.id, kasmId: session.kasmId },
      { secret: this.env.SESSION_TOKEN_SECRET, expiresIn: this.env.SESSION_TOKEN_TTL },
    );
    const connectionUrl = sessionConnectionUrl({
      kasmId: session.kasmId,
      proxyBaseUrl: server.zone?.proxyBaseUrl ?? this.env.CHISTA_PUBLIC_URL,
      token,
    });
    await prisma.session.update({ where: { id: session.id }, data: { connectionUrl } });

    // The connection-proxy reads this Redis record (by kasmId) to bridge to guacd.
    await this.redis.set(
      `chista:proxy:session:${session.kasmId}`,
      {
        sessionId: session.id,
        kasmId: session.kasmId,
        orgId: user.orgId,
        userId: user.sub,
        protocol: server.connectionType, // 'RDP' | 'VNC' | 'SSH'
        internalHost: server.address,
        internalPort: port,
        status: 'RUNNING',
        rdpUser: creds.username,
        rdpPassword: creds.password,
        sshUser: creds.username,
        sshPassword: creds.password,
        security: creds.security,
      },
      3600,
    );

    await this.audit.record({
      orgId: user.orgId,
      actorUserId: user.sub,
      action: 'server.connect',
      targetType: 'Server',
      targetId: server.id,
      metadata: { sessionId: session.id },
    });
    return { sessionId: session.id, kasmId: session.kasmId, connectionUrl, connectionType };
  }

  /**
   * Generate a downloadable `.rdp` file for the native Remote Desktop client
   * ("Open Session In → RDP Client"). The native client connects directly to
   * the server's RDP host, so multi-monitor, clipboard and local-drive access
   * all work through the real client. Returns `{ filename, content }` — the web
   * turns it into a download. No session/Redis record is created (no proxy).
   */
  async rdpFile(
    orgId: string,
    actorUserId: string,
    id: string,
    opts: Pick<RdpFileOptions, 'multimon' | 'clipboard' | 'drives' | 'printers'> = {},
  ) {
    const server = await prisma.server.findFirst({ where: { id, orgId } });
    if (!server) throw new NotFoundException('Server not found');
    if (server.connectionType !== 'RDP') {
      throw new BadRequestException('RDP file download is only available for RDP servers');
    }

    const creds = server.credentialRef
      ? (unsealConfig(server.credentialRef, this.env.SECRET_SEAL_KEY) as { username?: string })
      : {};

    const content = buildRdpFile({
      address: server.address,
      username: creds.username,
      multimon: opts.multimon,
      clipboard: opts.clipboard,
      drives: opts.drives,
      printers: opts.printers,
    });
    const filename = `${server.hostname.replace(/[^a-zA-Z0-9._-]+/g, '-') || 'remote'}.rdp`;

    await this.audit.record({
      orgId,
      actorUserId,
      action: 'server.rdp-file',
      targetType: 'Server',
      targetId: id,
    });
    return { filename, content };
  }
}
