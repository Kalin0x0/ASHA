import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import type { RegisterServerAgentDto, ServerAgentHeartbeatDto } from '@chista/contracts';
import { prisma } from '@chista/db';
import { RegistrationTokensService } from '../registration-tokens/registration-tokens.service';

/** A server is considered offline if no heartbeat arrives within this window. */
const STALE_MS = 90_000;

/**
 * Availability layer for the installable host/Windows agent: agents authenticate
 * with a registration token, auto-register their desktop as a Server, and send
 * heartbeats so Chista tracks online/offline status. (Reachability via a reverse
 * tunnel is a separate, follow-up piece.)
 */
@Injectable()
export class ServerAgentService {
  constructor(private readonly tokens: RegistrationTokensService) {}

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

  /** Flip agent-backed servers to OFFLINE once their heartbeat goes stale. */
  @Interval(60_000)
  async reapStale() {
    await prisma.server.updateMany({
      where: { status: 'ONLINE', lastSeenAt: { lt: new Date(Date.now() - STALE_MS) } },
      data: { status: 'OFFLINE' },
    });
  }
}
