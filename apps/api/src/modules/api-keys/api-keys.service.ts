import { Injectable, NotFoundException } from '@nestjs/common';
import { hashToken, randomToken } from '@chista/crypto';
import { prisma } from '@chista/db';
import { AuditService } from '../../common/audit.service';

/**
 * Personal/service API keys. The raw key is shown exactly once at creation;
 * only its SHA-256 hash and a short prefix are persisted. Keys carry scopes
 * (e.g. SCIM, SESSION_LAUNCH) and an optional expiry.
 */
@Injectable()
export class ApiKeysService {
  constructor(private readonly audit: AuditService) {}

  list(orgId: string) {
    return prisma.apiKey.findMany({
      where: { orgId },
      select: {
        id: true,
        name: true,
        prefix: true,
        scopes: true,
        lastUsedAt: true,
        expiresAt: true,
        revokedAt: true,
        createdAt: true,
        userId: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(
    orgId: string,
    actorUserId: string,
    dto: { name: string; scopes?: string[]; expiresInDays?: number },
  ) {
    const raw = randomToken(32);
    const prefix = raw.slice(0, 8);
    const expiresAt = dto.expiresInDays
      ? new Date(Date.now() + dto.expiresInDays * 86_400_000)
      : null;

    const created = await prisma.apiKey.create({
      data: {
        orgId,
        userId: actorUserId,
        name: dto.name,
        prefix,
        hashedKey: hashToken(raw),
        scopes: dto.scopes ?? [],
        expiresAt,
      },
    });
    await this.audit.record({
      orgId,
      actorUserId,
      action: 'apikey.create',
      targetType: 'ApiKey',
      targetId: created.id,
      metadata: { scopes: dto.scopes ?? [] },
    });
    // The raw token is returned only here.
    return { id: created.id, name: created.name, prefix, token: raw, scopes: created.scopes, expiresAt };
  }

  async revoke(orgId: string, actorUserId: string, id: string) {
    const res = await prisma.apiKey.updateMany({
      where: { id, orgId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (res.count === 0) throw new NotFoundException('API key not found');
    await this.audit.record({
      orgId,
      actorUserId,
      action: 'apikey.revoke',
      targetType: 'ApiKey',
      targetId: id,
    });
    return { ok: true };
  }
}
