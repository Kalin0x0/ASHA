import 'reflect-metadata';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, otpMock } = vi.hoisted(() => ({
  prismaMock: { twoFactorMethod: { findFirst: vi.fn() } },
  otpMock: { verify: vi.fn() },
}));
vi.mock('@chista/db', () => ({ prisma: prismaMock }));
vi.mock('@chista/crypto', () => ({ hashToken: (t: string) => `h:${t}`, randomToken: () => 'r', verifyPassword: vi.fn() }));
vi.mock('otplib', () => ({ verify: otpMock.verify, generateSecret: vi.fn(), generateURI: vi.fn() }));

import { AuthService } from './auth.service';

const audit = { record: vi.fn().mockResolvedValue(undefined) };
const env = { JWT_ACCESS_SECRET: 'a', JWT_REFRESH_SECRET: 'r', JWT_ACCESS_TTL: 900, JWT_REFRESH_TTL: 600 } as never;
const USER = { sub: 'u1', orgId: 'org1', email: 'u@x.io', isSystemAdmin: false } as never;

function makeSvc() {
  const jwt = { signAsync: vi.fn().mockResolvedValue('elevated-token'), verifyAsync: vi.fn() };
  return { svc: new AuthService(jwt as never, {} as never, audit as never, env), jwt };
}

describe('AuthService.stepUp (C4)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('mints an acr=step-up token (TTL capped at 300s) on a valid TOTP', async () => {
    const { svc, jwt } = makeSvc();
    prismaMock.twoFactorMethod.findFirst.mockResolvedValue({ id: 'm', secret: 'S', type: 'TOTP', confirmed: true });
    otpMock.verify.mockReturnValue({ valid: true });
    const res = await svc.stepUp(USER, '123456');
    expect(res).toMatchObject({ accessToken: 'elevated-token', acr: 'step-up', expiresIn: 300 });
    expect(jwt.signAsync).toHaveBeenCalledWith(
      expect.objectContaining({ acr: 'step-up', sub: 'u1' }),
      expect.objectContaining({ expiresIn: 300 }),
    );
  });

  it('rejects an invalid TOTP', async () => {
    const { svc } = makeSvc();
    prismaMock.twoFactorMethod.findFirst.mockResolvedValue({ id: 'm', secret: 'S', type: 'TOTP', confirmed: true });
    otpMock.verify.mockReturnValue({ valid: false });
    await expect(svc.stepUp(USER, '000000')).rejects.toThrow(UnauthorizedException);
  });

  it('rejects when no confirmed TOTP method is enrolled', async () => {
    const { svc } = makeSvc();
    prismaMock.twoFactorMethod.findFirst.mockResolvedValue(null);
    await expect(svc.stepUp(USER, '123456')).rejects.toThrow(BadRequestException);
  });
});
