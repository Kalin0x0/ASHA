import 'reflect-metadata';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: { user: { findFirst: vi.fn() } },
}));
vi.mock('@chista/db', () => ({ prisma: prismaMock }));
vi.mock('@chista/crypto', () => ({ hashToken: (t: string) => `hash:${t}`, randomToken: () => 'r' }));

import { AuthService } from './auth.service';

const audit = { record: vi.fn().mockResolvedValue(undefined) };
const TARGET = {
  id: 'u2',
  orgId: 'org1',
  email: 't@x.io',
  isSystemAdmin: false,
  status: 'ACTIVE',
  displayName: 'Target',
  createdAt: new Date(),
  updatedAt: new Date(),
};
const ADMIN = { sub: 'admin1', orgId: 'org1', email: 'a@x.io', isSystemAdmin: true } as never;

function makeSvc(ttl = 900) {
  const jwt = { signAsync: vi.fn().mockResolvedValue('imp-token'), verifyAsync: vi.fn() };
  const env = { JWT_ACCESS_SECRET: 'a', JWT_REFRESH_SECRET: 'r', JWT_ACCESS_TTL: ttl, JWT_REFRESH_TTL: 600 } as never;
  const svc = new AuthService(jwt as never, {} as never, audit as never, env);
  return { svc, jwt };
}

describe('AuthService.impersonate', () => {
  beforeEach(() => vi.clearAllMocks());

  it('refuses a non-system-admin actor (no DB touch)', async () => {
    const { svc } = makeSvc();
    await expect(svc.impersonate({ ...(ADMIN as object), isSystemAdmin: false } as never, 'u2')).rejects.toThrow(
      ForbiddenException,
    );
    expect(prismaMock.user.findFirst).not.toHaveBeenCalled();
  });

  it('refuses self-impersonation', async () => {
    const { svc } = makeSvc();
    await expect(svc.impersonate(ADMIN, 'admin1')).rejects.toThrow(BadRequestException);
  });

  it('refuses a target in another org / not found (same-org enforced in the query)', async () => {
    const { svc } = makeSvc();
    prismaMock.user.findFirst.mockResolvedValue(null);
    await expect(svc.impersonate(ADMIN, 'u2')).rejects.toThrow(NotFoundException);
    expect(prismaMock.user.findFirst).toHaveBeenCalledWith({ where: { id: 'u2', orgId: 'org1' } });
  });

  it('mints a short-lived token with an act-claim and NO refresh token', async () => {
    const { svc, jwt } = makeSvc(900);
    prismaMock.user.findFirst.mockResolvedValue(TARGET);
    const res = await svc.impersonate(ADMIN, 'u2');
    expect(jwt.signAsync).toHaveBeenCalledWith(
      expect.objectContaining({ sub: 'u2', act: { sub: 'admin1', email: 'a@x.io' } }),
      expect.objectContaining({ expiresIn: 900 }),
    );
    expect(res).toMatchObject({ accessToken: 'imp-token', tokenType: 'Bearer', expiresIn: 900 });
    expect(res).not.toHaveProperty('refreshToken');
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'user.impersonate' }));
  });

  it('caps the impersonation TTL at 1800s even if the access TTL is longer', async () => {
    const { svc, jwt } = makeSvc(7200);
    prismaMock.user.findFirst.mockResolvedValue(TARGET);
    const res = await svc.impersonate(ADMIN, 'u2');
    expect(res.expiresIn).toBe(1800);
    expect(jwt.signAsync).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ expiresIn: 1800 }));
  });
});
