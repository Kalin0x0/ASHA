import { createHash, randomBytes } from 'node:crypto';
import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
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

  /**
   * Validate a plaintext registration token (used by agents). Throws 401 if the
   * token is unknown, revoked or expired; otherwise returns the owning org +
   * (optional) zone. Read-only — call {@link markUsed} to record usage (agents
   * heartbeat frequently, so we don't write on every validate).
   */
  async validate(plaintext: string): Promise<{ orgId: string; zoneId: string | null; tokenId: string }> {
    const tok = plaintext
      ? await prisma.registrationToken.findUnique({ where: { tokenHash: hashAgentToken(plaintext) } })
      : null;
    if (!tok || tok.revokedAt || (tok.expiresAt && tok.expiresAt.getTime() < Date.now())) {
      throw new UnauthorizedException('Invalid or expired registration token');
    }
    return { orgId: tok.orgId, zoneId: tok.zoneId, tokenId: tok.id };
  }

  async markUsed(tokenId: string): Promise<void> {
    await prisma.registrationToken.update({
      where: { id: tokenId },
      data: { lastUsedAt: new Date(), useCount: { increment: 1 } },
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
