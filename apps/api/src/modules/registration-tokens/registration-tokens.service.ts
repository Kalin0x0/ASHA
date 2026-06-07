import { createHash, randomBytes } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from '@chista/db';
import type { AuthUser } from '../../common/decorators';

/** sha256 hex of an agent token — the only form we persist. */
export function hashAgentToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface MintTokenInput {
  name: string;
  zoneId?: string;
  expiresInDays?: number;
}

@Injectable()
export class RegistrationTokensService {
  /** Mint a token. The plaintext is returned ONCE and never stored or shown again. */
  async mint(user: AuthUser, dto: MintTokenInput) {
    const token = `cra_${randomBytes(24).toString('base64url')}`;
    const expiresAt =
      dto.expiresInDays && dto.expiresInDays > 0
        ? new Date(Date.now() + dto.expiresInDays * 86_400_000)
        : null;
    const rec = await prisma.registrationToken.create({
      data: {
        orgId: user.orgId,
        name: dto.name,
        tokenHash: hashAgentToken(token),
        zoneId: dto.zoneId ?? null,
        expiresAt,
        createdById: user.sub,
      },
    });
    return {
      id: rec.id,
      name: rec.name,
      token, // shown once
      zoneId: rec.zoneId,
      expiresAt: rec.expiresAt,
      createdAt: rec.createdAt,
    };
  }

  async list(user: AuthUser) {
    return prisma.registrationToken.findMany({
      where: { orgId: user.orgId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        zoneId: true,
        expiresAt: true,
        revokedAt: true,
        lastUsedAt: true,
        useCount: true,
        createdAt: true,
      },
    });
  }

  async revoke(user: AuthUser, id: string) {
    const res = await prisma.registrationToken.updateMany({
      where: { id, orgId: user.orgId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (res.count === 0) throw new NotFoundException('Registration token not found');
    return { ok: true };
  }
}
