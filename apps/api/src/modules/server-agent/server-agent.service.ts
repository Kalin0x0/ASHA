import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import type { Env } from '@asha/config';
import type { RegisterServerAgentDto, ServerAgentHeartbeatDto } from '@asha/contracts';
import { generateWireguardKeypair } from '@asha/crypto';
import { prisma } from '@asha/db';
import { ENV } from '../../common/env.module';
import { RegistrationTokensService } from '../registration-tokens/registration-tokens.service';

/** A server is considered offline if no heartbeat arrives within this window. */
const STALE_MS = 90_000;

/** Render a WireGuard client config for a host joining Asha's tunnel network. */
function renderWgClientConfig(o: {
  privateKey: string;
  address: string;
  serverPublicKey: string;
  endpoint: string;
  allowedIps: string;
}): string {
  return [
    '[Interface]',
    `PrivateKey = ${o.privateKey}`,
    `Address = ${o.address}/32`,
    '',
    '[Peer]',
    `PublicKey = ${o.serverPublicKey}`,
    `Endpoint = ${o.endpoint}`,
    `AllowedIPs = ${o.allowedIps}`,
    'PersistentKeepalive = 25',
    '',
  ].join('\n');
}

/**
 * Availability layer for the installable host/Windows agent: agents authenticate
 * with a registration token, auto-register their desktop as a Server, and send
 * heartbeats so Asha tracks online/offline status. (Reachability via a reverse
 * tunnel is a separate, follow-up piece.)
 */
@Injectable()
export class ServerAgentService {
  constructor(
    private readonly tokens: RegistrationTokensService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private async resolveZoneId(orgId: string, preferred?: string | null): Promise<string> {
    if (preferred) {
      const z = await prisma.deploymentZone.findFirst({ where: { id: preferred, orgId } });
      if (z) return z.id;
    }
    const def =
      (await prisma.deploymentZone.findFirst({ where: { orgId, isDefault: true } })) ??
      (await prisma.deploymentZone.findFirst({ where: { orgId }, orderBy: { createdAt: 'asc' } }));
    if (!def) throw new NotFoundException('No deployment zone configured');
    return def.id;
  }

  /** Auto-register (or refresh) the calling host as a Server, marked ONLINE. */
  async register(token: string, dto: RegisterServerAgentDto) {
    const { orgId, zoneId: tokenZone, tokenId } = await this.tokens.validate(token);
    await this.tokens.markUsed(tokenId);
    const zoneId = await this.resolveZoneId(orgId, dto.zoneId ?? tokenZone);

    const existing = await prisma.server.findFirst({ where: { orgId, hostname: dto.hostname } });
    const data = {
      address: dto.address,
      connectionType: dto.connectionType,
      status: 'ONLINE' as const,
      lastSeenAt: new Date(),
      agentVersion: dto.version ?? null,
      ...(dto.maxSessions ? { maxSessions: dto.maxSessions } : {}),
    };
    const server = existing
      ? await prisma.server.update({ where: { id: existing.id }, data })
      : await prisma.server.create({ data: { orgId, zoneId, hostname: dto.hostname, ...data } });

    return { serverId: server.id, zoneId, status: server.status };
  }

  /** Keep a registered server marked ONLINE. */
  async heartbeat(token: string, dto: ServerAgentHeartbeatDto) {
    const { orgId } = await this.tokens.validate(token);
    const res = await prisma.server.updateMany({
      where: { orgId, hostname: dto.hostname },
      data: {
        status: 'ONLINE',
        lastSeenAt: new Date(),
        ...(dto.version ? { agentVersion: dto.version } : {}),
      },
    });
    if (res.count === 0) throw new UnauthorizedException('Server not registered — call register first');
    return { ok: true };
  }

  // ── Reverse tunnel (WireGuard reachability) ─────────────────────────────────

  private tunnelConfigured(): boolean {
    return Boolean(this.env.ASHA_WG_ENDPOINT && this.env.ASHA_WG_SERVER_PUBLIC_KEY);
  }

  /** Assign the next free /24 host address from the configured tunnel subnet. */
  private async assignTunnelIp(orgId: string): Promise<string> {
    const rows = await prisma.server.findMany({
      where: { orgId, tunnelIp: { not: null } },
      select: { tunnelIp: true },
    });
    const used = new Set(rows.map((r) => r.tunnelIp));
    const prefix = this.env.ASHA_WG_SUBNET.split('/')[0]!.split('.').slice(0, 3).join('.'); // /24
    for (let host = 2; host < 255; host += 1) {
      const ip = `${prefix}.${host}`;
      if (!used.has(ip)) return ip;
    }
    throw new BadRequestException('Tunnel subnet exhausted');
  }

  /**
   * Issue a WireGuard tunnel config for a registered host: assign a tunnel IP,
   * generate a keypair, store the host's public key + tunnel IP, and point the
   * server's address at the tunnel IP so sessions reach it over the tunnel. The
   * admin applies the matching peer (see {@link wgPeers}) to the WG server.
   */
  async requestTunnel(token: string, hostname: string) {
    const { orgId } = await this.tokens.validate(token);
    if (!this.tunnelConfigured()) {
      throw new BadRequestException('Reverse tunnel is not configured on this Asha server');
    }
    const server = await prisma.server.findFirst({ where: { orgId, hostname } });
    if (!server) throw new UnauthorizedException('Server not registered — call register first');

    const keys = generateWireguardKeypair();
    const tunnelIp = server.tunnelIp ?? (await this.assignTunnelIp(orgId));
    await prisma.server.update({
      where: { id: server.id },
      data: {
        tunnelIp,
        tunnelPublicKey: keys.publicKey,
        address: tunnelIp,
        status: 'ONLINE',
        lastSeenAt: new Date(),
      },
    });

    const config = renderWgClientConfig({
      privateKey: keys.privateKey,
      address: tunnelIp,
      serverPublicKey: this.env.ASHA_WG_SERVER_PUBLIC_KEY,
      endpoint: this.env.ASHA_WG_ENDPOINT,
      allowedIps: this.env.ASHA_WG_ALLOWED_IPS,
    });
    return { tunnelIp, config };
  }

  /** The WireGuard server-side `[Peer]` blocks for every tunnelled host (for ops). */
  async wgPeers(orgId: string) {
    const servers = await prisma.server.findMany({
      where: { orgId, tunnelIp: { not: null }, tunnelPublicKey: { not: null } },
      select: { hostname: true, tunnelIp: true, tunnelPublicKey: true },
      orderBy: { hostname: 'asc' },
    });
    const content = servers
      .map((s) => `# ${s.hostname}\n[Peer]\nPublicKey = ${s.tunnelPublicKey}\nAllowedIPs = ${s.tunnelIp}/32\n`)
      .join('\n');
    return { count: servers.length, content };
  }

  /** Flip agent-backed servers to OFFLINE once their heartbeat goes stale. */
  @Interval(60_000)
  async reapStale() {
    await prisma.server.updateMany({
      where: { status: 'ONLINE', lastSeenAt: { lt: new Date(Date.now() - STALE_MS) } },
      data: { status: 'OFFLINE' },
    });
  }
}
