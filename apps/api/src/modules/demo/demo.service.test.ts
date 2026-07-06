import 'reflect-metadata';
import { ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    org: { findFirst: vi.fn() },
    setting: { findUnique: vi.fn() },
    demoGrant: { findFirst: vi.fn(), create: vi.fn() },
    user: { findFirst: vi.fn(), create: vi.fn() },
    group: { findFirst: vi.fn() },
    userGroup: { create: vi.fn() },
    workspace: { findMany: vi.fn() },
    workspaceUser: { create: vi.fn() },
    tariff: { findFirst: vi.fn(), create: vi.fn() },
    tariffAssignment: { upsert: vi.fn() },
  },
}));

vi.mock('@asha/db', () => ({ prisma: prismaMock }));
vi.mock('@asha/crypto', () => ({ hashToken: (s: string) => `hash(${s})` }));

import { DemoService } from './demo.service';

function makeService() {
  const jwt = { signAsync: vi.fn().mockResolvedValue('demo.jwt.token') };
  const security = { emit: vi.fn().mockResolvedValue(undefined) };
  const env = { JWT_ACCESS_TTL: 3600, JWT_ACCESS_SECRET: 'secret' };
  const svc = new DemoService(jwt as never, security as never, env as never);
  return { svc, jwt, security };
}

const INPUT = { email: 'Trial@Example.com', fingerprint: 'fp-abc', ip: '1.2.3.4', userAgent: 'jest' };

beforeEach(() => {
  for (const model of Object.values(prismaMock)) for (const fn of Object.values(model)) (fn as ReturnType<typeof vi.fn>).mockReset();
  prismaMock.org.findFirst.mockResolvedValue({ id: 'org1' });
  prismaMock.setting.findUnique.mockResolvedValue(null); // demo enabled by default
});

describe('DemoService.startDemo', () => {
  it('rejects and reports a repeat attempt on the same e-mail or device', async () => {
    const { svc, security } = makeService();
    prismaMock.demoGrant.findFirst.mockResolvedValue({ id: 'g1', email: 'trial@example.com' });

    await expect(svc.startDemo(INPUT)).rejects.toBeInstanceOf(ForbiddenException);
    expect(security.emit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'auth.demo_abuse', metadata: expect.objectContaining({ reason: 'email_reused' }) }),
    );
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it('rejects when a real account already owns the e-mail', async () => {
    const { svc, security } = makeService();
    prismaMock.demoGrant.findFirst.mockResolvedValue(null);
    prismaMock.user.findFirst.mockResolvedValue({ id: 'existing' });

    await expect(svc.startDemo(INPUT)).rejects.toBeInstanceOf(ForbiddenException);
    expect(security.emit).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ reason: 'existing_account' }) }),
    );
  });

  it('mints an isolated, time-boxed demo user and a 10-minute token', async () => {
    const { svc, jwt, security } = makeService();
    prismaMock.demoGrant.findFirst.mockResolvedValue(null);
    prismaMock.user.findFirst.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue({ id: 'demo1', orgId: 'org1', email: 'trial@example.com', username: 'demo-x', displayName: 'Demo user' });
    prismaMock.group.findFirst.mockResolvedValue({ id: 'grp-demo' });
    prismaMock.workspace.findMany.mockResolvedValue([{ id: 'ws-firefox' }]);
    prismaMock.tariff.findFirst.mockResolvedValue(null);
    prismaMock.tariff.create.mockResolvedValue({ id: 'tar-demo', period: 'MINUTE' });

    const res = await svc.startDemo(INPUT);

    // e-mail normalised to lowercase for the created user
    expect(prismaMock.user.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ email: 'trial@example.com', status: 'DEMO' }) }),
    );
    // joined a group, granted the demo workspace, assigned a 10-min budget, wrote the grant
    expect(prismaMock.userGroup.create).toHaveBeenCalled();
    expect(prismaMock.workspaceUser.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ workspaceId: 'ws-firefox', userId: 'demo1' }) }),
    );
    expect(prismaMock.tariffAssignment.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ remainingSeconds: 600 }) }),
    );
    expect(prismaMock.demoGrant.create).toHaveBeenCalled();
    // token capped at 10 minutes, no refresh token
    expect(jwt.signAsync).toHaveBeenCalledWith(expect.objectContaining({ demo: true }), expect.objectContaining({ expiresIn: 600 }));
    expect(res).toMatchObject({ accessToken: 'demo.jwt.token', refreshToken: null, expiresIn: 600 });
    expect(security.emit).toHaveBeenCalledWith(expect.objectContaining({ action: 'auth.demo_started' }));
  });

  it('refuses when demo access is disabled by setting', async () => {
    const { svc } = makeService();
    prismaMock.setting.findUnique.mockResolvedValue({ valueJson: false });

    await expect(svc.startDemo(INPUT)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prismaMock.demoGrant.findFirst).not.toHaveBeenCalled();
  });
});
