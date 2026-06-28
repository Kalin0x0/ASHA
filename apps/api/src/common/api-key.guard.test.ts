import 'reflect-metadata';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the data layer + crypto. hashToken is identity-prefixed so a presented
// key maps predictably to a stored hash; safeEqual is a plain compare.
const { prismaMock } = vi.hoisted(() => ({
  prismaMock: { apiKey: { findUnique: vi.fn(), update: vi.fn() } },
}));
vi.mock('@asha/db', () => ({ prisma: prismaMock, runUnscoped: (fn: () => unknown) => fn() }));
vi.mock('@asha/crypto', () => ({
  hashToken: (t: string) => `hash:${t}`,
  safeEqual: (a: string, b: string) => a === b,
}));

import { ApiKeyGuard } from './api-key.guard';

const KEY = 'k'.repeat(40);
const VALID_ROW = {
  id: 'ak1',
  userId: 'u1',
  orgId: 'org1',
  prefix: KEY.slice(0, 8),
  hashedKey: `hash:${KEY}`,
  scopes: ['sessions:read'],
  revokedAt: null,
  expiresAt: null,
};

function makeCtx(headers: Record<string, string>, required?: string[]) {
  const req: Record<string, unknown> = { headers };
  const ctx = {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as never;
  const reflector = { getAllAndOverride: vi.fn().mockReturnValue(required) } as never;
  return { ctx, req, reflector };
}

describe('ApiKeyGuard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects a missing / too-short key', async () => {
    const { ctx, reflector } = makeCtx({});
    await expect(new ApiKeyGuard(reflector).canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    expect(prismaMock.apiKey.findUnique).not.toHaveBeenCalled();
  });

  it('accepts a valid key and pins a NON-admin, org-scoped principal', async () => {
    prismaMock.apiKey.findUnique.mockResolvedValue(VALID_ROW);
    prismaMock.apiKey.update.mockResolvedValue({});
    const { ctx, req, reflector } = makeCtx({ 'x-api-key': KEY });
    await expect(new ApiKeyGuard(reflector).canActivate(ctx)).resolves.toBe(true);
    expect((req as { user: unknown }).user).toMatchObject({ orgId: 'org1', isSystemAdmin: false });
    expect((req as { apiKey: unknown }).apiKey).toMatchObject({ id: 'ak1' });
  });

  it('accepts the key via "Authorization: ApiKey <key>"', async () => {
    prismaMock.apiKey.findUnique.mockResolvedValue(VALID_ROW);
    const { ctx, reflector } = makeCtx({ authorization: `ApiKey ${KEY}` });
    await expect(new ApiKeyGuard(reflector).canActivate(ctx)).resolves.toBe(true);
  });

  it('rejects a revoked key', async () => {
    prismaMock.apiKey.findUnique.mockResolvedValue({ ...VALID_ROW, revokedAt: new Date() });
    const { ctx, reflector } = makeCtx({ 'x-api-key': KEY });
    await expect(new ApiKeyGuard(reflector).canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects an expired key', async () => {
    prismaMock.apiKey.findUnique.mockResolvedValue({ ...VALID_ROW, expiresAt: new Date(Date.now() - 1000) });
    const { ctx, reflector } = makeCtx({ 'x-api-key': KEY });
    await expect(new ApiKeyGuard(reflector).canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a wrong key (hash mismatch — no timing leak via early return)', async () => {
    prismaMock.apiKey.findUnique.mockResolvedValue({ ...VALID_ROW, hashedKey: 'hash:SOMETHING-ELSE' });
    const { ctx, reflector } = makeCtx({ 'x-api-key': KEY });
    await expect(new ApiKeyGuard(reflector).canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('enforces required scopes (missing scope → forbidden)', async () => {
    prismaMock.apiKey.findUnique.mockResolvedValue({ ...VALID_ROW, scopes: ['sessions:read'] });
    const { ctx, reflector } = makeCtx({ 'x-api-key': KEY }, ['sessions:write']);
    await expect(new ApiKeyGuard(reflector).canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('passes any scope check when the key holds the "*" wildcard', async () => {
    prismaMock.apiKey.findUnique.mockResolvedValue({ ...VALID_ROW, scopes: ['*'] });
    const { ctx, reflector } = makeCtx({ 'x-api-key': KEY }, ['sessions:write', 'sessions:read']);
    await expect(new ApiKeyGuard(reflector).canActivate(ctx)).resolves.toBe(true);
  });
});
