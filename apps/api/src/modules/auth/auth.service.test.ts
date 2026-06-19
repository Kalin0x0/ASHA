import 'reflect-metadata';
import { UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the data layer + crypto so the service under test pulls no real Prisma
// client or hashing. hashToken is made deterministic (identity) so test tokens
// map predictably to stored hashes.
const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    refreshToken: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
    user: { findUnique: vi.fn() },
  },
}));

vi.mock('@asha/db', () => ({ prisma: prismaMock }));
vi.mock('@asha/crypto', () => ({
  hashToken: (t: string) => `hash:${t}`,
  randomToken: () => 'fam-new',
}));

import { AuthService } from './auth.service';

const audit = { record: vi.fn().mockResolvedValue(undefined) };
const env = {
  JWT_ACCESS_SECRET: 'a',
  JWT_REFRESH_SECRET: 'r',
  JWT_ACCESS_TTL: 900,
  JWT_REFRESH_TTL: 604_800,
} as never;

const ACTIVE_USER = { id: 'u1', orgId: 'org1', email: 'u@x.io', isSystemAdmin: false, status: 'ACTIVE' };

function makeService(jwtVerify: () => Promise<{ sub: string }>) {
  const jwt = {
    verifyAsync: vi.fn(jwtVerify),
    signAsync: vi.fn().mockResolvedValue('signed-token'),
  };
  const svc = new AuthService(jwt as never, {} as never, audit as never, env);
  return { svc, jwt };
}

describe('AuthService.refresh — rotation & replay detection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rotates a valid token and carries the family forward', async () => {
    const { svc } = makeService(async () => ({ sub: 'u1' }));
    prismaMock.refreshToken.findUnique.mockResolvedValue({
      id: 'rt1',
      userId: 'u1',
      family: 'fam-1',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    prismaMock.user.findUnique.mockResolvedValue(ACTIVE_USER);
    prismaMock.refreshToken.update.mockResolvedValue({});
    prismaMock.refreshToken.create.mockResolvedValue({});

    const result = await svc.refresh('good-token');

    // old token revoked
    expect(prismaMock.refreshToken.update).toHaveBeenCalledWith({
      where: { id: 'rt1' },
      data: { revokedAt: expect.any(Date) },
    });
    // new token persisted with the SAME family
    expect(prismaMock.refreshToken.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ family: 'fam-1' }) }),
    );
    expect(result).toMatchObject({ accessToken: 'signed-token', tokenType: 'Bearer' });
  });

  it('detects replay of a revoked token and burns the whole family', async () => {
    const { svc } = makeService(async () => ({ sub: 'u1' }));
    prismaMock.refreshToken.findUnique.mockResolvedValue({
      id: 'rt1',
      userId: 'u1',
      family: 'fam-1',
      revokedAt: new Date(), // already rotated → replay
      expiresAt: new Date(Date.now() + 60_000),
    });
    prismaMock.user.findUnique.mockResolvedValue(ACTIVE_USER);
    prismaMock.refreshToken.updateMany.mockResolvedValue({ count: 3 });

    await expect(svc.refresh('replayed-token')).rejects.toThrow(UnauthorizedException);

    // entire family revoked in one sweep
    expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { family: 'fam-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    // breach recorded for forensics
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'auth.refresh_replay_detected' }),
    );
    // no new tokens minted
    expect(prismaMock.refreshToken.create).not.toHaveBeenCalled();
  });

  it('rejects a token that was never issued', async () => {
    const { svc } = makeService(async () => ({ sub: 'u1' }));
    prismaMock.refreshToken.findUnique.mockResolvedValue(null);
    await expect(svc.refresh('forged-token')).rejects.toThrow(UnauthorizedException);
    expect(prismaMock.refreshToken.updateMany).not.toHaveBeenCalled();
  });

  it('rejects an expired token without touching the family', async () => {
    const { svc } = makeService(async () => ({ sub: 'u1' }));
    prismaMock.refreshToken.findUnique.mockResolvedValue({
      id: 'rt1',
      userId: 'u1',
      family: 'fam-1',
      revokedAt: null,
      expiresAt: new Date(Date.now() - 1_000), // expired
    });
    await expect(svc.refresh('stale-token')).rejects.toThrow(UnauthorizedException);
    expect(prismaMock.refreshToken.update).not.toHaveBeenCalled();
    expect(prismaMock.refreshToken.create).not.toHaveBeenCalled();
  });

  it('rejects a token with an invalid signature', async () => {
    const { svc } = makeService(async () => {
      throw new Error('bad signature');
    });
    await expect(svc.refresh('tampered')).rejects.toThrow(UnauthorizedException);
    expect(prismaMock.refreshToken.findUnique).not.toHaveBeenCalled();
  });

  it('refuses to rotate for a suspended user', async () => {
    const { svc } = makeService(async () => ({ sub: 'u1' }));
    prismaMock.refreshToken.findUnique.mockResolvedValue({
      id: 'rt1',
      userId: 'u1',
      family: 'fam-1',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    prismaMock.user.findUnique.mockResolvedValue({ ...ACTIVE_USER, status: 'SUSPENDED' });
    await expect(svc.refresh('good-token')).rejects.toThrow(UnauthorizedException);
    expect(prismaMock.refreshToken.create).not.toHaveBeenCalled();
  });
});
