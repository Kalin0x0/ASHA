import 'reflect-metadata';
import { ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    org: { findFirst: vi.fn() },
    setting: { findUnique: vi.fn() },
    demoGrant: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    user: { findFirst: vi.fn(), create: vi.fn() },
    group: { findFirst: vi.fn() },
    userGroup: { create: vi.fn() },
    workspace: { findMany: vi.fn() },
    workspaceUser: { create: vi.fn() },
    tariff: { findFirst: vi.fn(), create: vi.fn(), upsert: vi.fn() },
    tariffAssignment: { upsert: vi.fn() },
  },
}));

// $transaction runs the callback against the same mock, so the assertions below
// see every write the transactional block performs.
vi.mock('@asha/db', () => ({
  prisma: { ...prismaMock, $transaction: (fn: (tx: unknown) => unknown) => fn(prismaMock) },
}));
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
    prismaMock.tariff.upsert.mockResolvedValue({ id: 'tar-demo', period: 'MINUTE' });

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

describe('DemoService.startDemo — provisioning is atomic and one-shot', () => {
  const ready = () => {
    prismaMock.demoGrant.findFirst.mockResolvedValue(null);
    prismaMock.user.findFirst.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue({ id: 'demo1', orgId: 'org1', email: 'trial@example.com', username: 'demo-x', displayName: 'Demo user' });
    prismaMock.group.findFirst.mockResolvedValue({ id: 'grp-demo' });
    prismaMock.workspace.findMany.mockResolvedValue([{ id: 'ws-firefox' }]);
    prismaMock.tariff.upsert.mockResolvedValue({ id: 'tar-demo', period: 'MINUTE' });
  };

  it('writes the DemoGrant FIRST so the unique index arbitrates a race', async () => {
    // Two concurrent requests with different e-mails but the same fingerprint
    // both cleared the earlier read. Creating the user first left the loser's
    // account, group membership and workspace grants committed before it died
    // on the grant's unique index — a permanent orphan holding a seat.
    const { svc } = makeService();
    ready();
    const order: string[] = [];
    prismaMock.demoGrant.create.mockImplementation(async () => { order.push('grant'); return {}; });
    prismaMock.user.create.mockImplementation(async () => {
      order.push('user');
      return { id: 'demo1', orgId: 'org1', email: 'trial@example.com', username: 'demo-x', displayName: 'Demo user' };
    });

    await svc.startDemo(INPUT);

    expect(order).toEqual(['grant', 'user']);
  });

  it('upserts the demo tariff rather than check-then-create', async () => {
    // Two first-ever signups from different IPs both saw null and both tried to
    // create it; the loser got a raw P2002 -> 500.
    const { svc } = makeService();
    ready();

    await svc.startDemo(INPUT);

    expect(prismaMock.tariff.upsert).toHaveBeenCalled();
    expect(prismaMock.tariff.create).not.toHaveBeenCalled();
  });

  it('leaves periodResetAt NULL so the 10-minute budget never refills', async () => {
    // A MINUTE-period assignment with a reset date was refilled to 600s every
    // minute forever, which made the tariff half of the time-box meaningless.
    const { svc } = makeService();
    ready();

    await svc.startDemo(INPUT);

    const call = prismaMock.tariffAssignment.upsert.mock.calls[0]![0] as {
      create: { periodResetAt: Date | null };
      update: { periodResetAt: Date | null };
    };
    expect(call.create.periodResetAt).toBeNull();
    expect(call.update.periodResetAt).toBeNull();
  });
});
