import 'reflect-metadata';
import { ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    tariff: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
    tariffAssignment: {
      findMany: vi.fn(),
      upsert: vi.fn().mockResolvedValue({ id: 'ta1' }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      update: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    userGroup: { findMany: vi.fn().mockResolvedValue([]) },
    session: { findMany: vi.fn().mockResolvedValue([]), update: vi.fn().mockResolvedValue({}), count: vi.fn().mockResolvedValue(0) },
    workspace: { findUnique: vi.fn().mockResolvedValue({ minuteCostFactor: 1 }) },
  },
}));

vi.mock('@asha/db', () => ({ prisma: prismaMock }));

import { TariffsService } from './tariffs.service';

const USER = { sub: 'u1', orgId: 'org1', email: 'u@x', isSystemAdmin: false } as never;

/** An assignment row as `resolveForUser` sees it (assignment + its tariff). */
const assignment = (
  subjectType: 'USER' | 'GROUP' | 'ORG',
  remainingSeconds: number,
  tariff: Partial<{ id: string; name: string; period: string; budgetMinutes: number | null; maxSessionMinutes: number | null; maxConcurrent: number | null }>,
) => ({
  id: `a-${subjectType}-${tariff.name}`,
  subjectType,
  remainingSeconds,
  tariff: {
    id: tariff.id ?? `t-${tariff.name}`,
    name: tariff.name ?? 'T',
    period: tariff.period ?? 'MONTH',
    budgetMinutes: tariff.budgetMinutes === undefined ? 600 : tariff.budgetMinutes,
    maxSessionMinutes: tariff.maxSessionMinutes ?? null,
    maxConcurrent: tariff.maxConcurrent ?? null,
  },
});

let svc: TariffsService;
beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.userGroup.findMany.mockResolvedValue([]);
  prismaMock.session.count.mockResolvedValue(0);
  prismaMock.session.update.mockResolvedValue({});
  prismaMock.tariffAssignment.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.workspace.findUnique.mockResolvedValue({ minuteCostFactor: 1 });
  svc = new TariffsService({ record: vi.fn() } as never);
});

describe('resolveForUser — precedence', () => {
  it('an explicit USER assignment beats group and org', async () => {
    prismaMock.tariffAssignment.findMany.mockResolvedValue([
      assignment('ORG', 999_999, { name: 'OrgDefault' }),
      assignment('GROUP', 100, { name: 'Group' }),
      assignment('USER', 50, { name: 'Personal' }),
    ]);

    expect((await svc.resolveForUser('org1', 'u1'))!.name).toBe('Personal');
  });

  it('picks the MOST RESTRICTIVE group — an unlimited plan must not win', async () => {
    // An unlimited tariff has no balance to track, so its assignment stores
    // remainingSeconds: 0 — which sorted first under a plain ascending sort and
    // handed contractors unlimited time.
    prismaMock.tariffAssignment.findMany.mockResolvedValue([
      assignment('GROUP', 0, { name: 'AllStaffUnlimited', budgetMinutes: null }),
      assignment('GROUP', 36_000, { name: 'Contractors', budgetMinutes: 600 }),
    ]);

    expect((await svc.resolveForUser('org1', 'u1'))!.name).toBe('Contractors');
  });

  it('still prefers the smaller of two limited group budgets', async () => {
    prismaMock.tariffAssignment.findMany.mockResolvedValue([
      assignment('GROUP', 36_000, { name: 'Big', budgetMinutes: 600 }),
      assignment('GROUP', 600, { name: 'Small', budgetMinutes: 10 }),
    ]);

    expect((await svc.resolveForUser('org1', 'u1'))!.name).toBe('Small');
  });

  it('falls back to the org default, and returns null when nothing applies', async () => {
    prismaMock.tariffAssignment.findMany.mockResolvedValue([assignment('ORG', 60, { name: 'OrgDefault' })]);
    expect((await svc.resolveForUser('org1', 'u1'))!.name).toBe('OrgDefault');

    prismaMock.tariffAssignment.findMany.mockResolvedValue([]);
    expect(await svc.resolveForUser('org1', 'u1')).toBeNull();
  });
});

describe('assertWithinTariff — the launch gate', () => {
  it('refuses a launch when the budget is used up', async () => {
    prismaMock.tariffAssignment.findMany.mockResolvedValue([assignment('USER', 0, { name: 'Basic', budgetMinutes: 600 })]);

    await expect(svc.assertWithinTariff(USER)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses a launch at the concurrency cap, and allows below it', async () => {
    prismaMock.tariffAssignment.findMany.mockResolvedValue([
      assignment('USER', 3600, { name: 'Basic', budgetMinutes: 600, maxConcurrent: 2 }),
    ]);

    prismaMock.session.count.mockResolvedValue(2);
    await expect(svc.assertWithinTariff(USER)).rejects.toBeInstanceOf(ForbiddenException);

    prismaMock.session.count.mockResolvedValue(1);
    await expect(svc.assertWithinTariff(USER)).resolves.toBeUndefined();
  });

  it('never blocks an unlimited holder', async () => {
    prismaMock.tariffAssignment.findMany.mockResolvedValue([assignment('USER', 0, { name: 'Unlimited', budgetMinutes: null })]);
    await expect(svc.assertWithinTariff(USER)).resolves.toBeUndefined();
  });
});

describe('sessionCapMs', () => {
  it('caps at the smaller of the per-session limit and the remaining budget', async () => {
    prismaMock.tariffAssignment.findMany.mockResolvedValue([
      // 30 min left, but the plan allows 120 min per session → 30 min wins.
      assignment('USER', 1800, { name: 'Basic', budgetMinutes: 600, maxSessionMinutes: 120 }),
    ]);

    expect(await svc.sessionCapMs(USER, 1)).toBe(1800 * 1000);
  });

  it('a costlier workspace burns the budget faster, so the cap shrinks', async () => {
    prismaMock.tariffAssignment.findMany.mockResolvedValue([assignment('USER', 1800, { name: 'Basic', budgetMinutes: 600 })]);

    expect(await svc.sessionCapMs(USER, 2)).toBe((1800 * 1000) / 2);
  });

  it('no tariff ⇒ no cap', async () => {
    prismaMock.tariffAssignment.findMany.mockResolvedValue([]);
    expect(await svc.sessionCapMs(USER, 1)).toBeNull();
  });
});

describe('meterAndCollectExhausted', () => {
  const runningSession = (id: string, consumedSeconds = 0) => ({
    id,
    orgId: 'org1',
    userId: 'u1',
    workspaceId: 'ws1',
    startedAt: new Date(Date.now() - 60_000), // one minute ago
    consumedSeconds,
  });

  it('reaps EVERY session of a holder whose budget just ran out, not only the first', async () => {
    // The budget is shared across a holder's sessions: when it hits zero all of
    // them have to go. Keying off the per-session decrement count reaped only
    // whichever session happened to consume the last of the balance, leaving
    // the rest running unmetered until their own expiresAt.
    prismaMock.session.findMany.mockResolvedValue([runningSession('s1'), runningSession('s2'), runningSession('s3')]);
    prismaMock.tariffAssignment.findMany.mockResolvedValue([
      assignment('USER', 30, { name: 'Basic', budgetMinutes: 600 }), // 30 s left, 60 s owed
    ]);

    const exhausted = await svc.meterAndCollectExhausted();

    expect(exhausted).toEqual(expect.arrayContaining(['s1', 's2', 's3']));
    expect(exhausted).toHaveLength(3);
  });

  it('leaves an unlimited holder alone', async () => {
    prismaMock.session.findMany.mockResolvedValue([runningSession('s1')]);
    prismaMock.tariffAssignment.findMany.mockResolvedValue([assignment('USER', 0, { name: 'Unlimited', budgetMinutes: null })]);

    expect(await svc.meterAndCollectExhausted()).toEqual([]);
    expect(prismaMock.tariffAssignment.updateMany).not.toHaveBeenCalled();
  });

  it('is self-correcting: only the unbilled delta is charged', async () => {
    // 60 s elapsed, 45 s already billed ⇒ charge 15 s, not 60.
    prismaMock.session.findMany.mockResolvedValue([runningSession('s1', 45)]);
    prismaMock.tariffAssignment.findMany.mockResolvedValue([assignment('USER', 3600, { name: 'Basic', budgetMinutes: 600 })]);

    await svc.meterAndCollectExhausted();

    const call = prismaMock.tariffAssignment.updateMany.mock.calls[0]![0] as {
      data: { remainingSeconds: { decrement: number } };
    };
    expect(call.data.remainingSeconds.decrement).toBe(15);
  });

  it('charges nothing when the session has already been billed past now', async () => {
    prismaMock.session.findMany.mockResolvedValue([runningSession('s1', 600)]);
    prismaMock.tariffAssignment.findMany.mockResolvedValue([assignment('USER', 3600, { name: 'Basic', budgetMinutes: 600 })]);

    expect(await svc.meterAndCollectExhausted()).toEqual([]);
    expect(prismaMock.tariffAssignment.updateMany).not.toHaveBeenCalled();
  });
});

describe('upsert — the org default assignment', () => {
  it('re-stocks the balance when the default moves to another tariff', async () => {
    // Switching the org default from an exhausted small plan to a large one
    // used to keep the old balance, locking every default user out of the plan
    // they had just been given.
    prismaMock.tariff.create.mockResolvedValue({ id: 't-pro' });
    prismaMock.tariff.updateMany.mockResolvedValue({ count: 1 });

    await svc.upsert('org1', 'admin', { name: 'Pro', period: 'MONTH', budgetMinutes: 6000, isDefault: true } as never);

    const call = prismaMock.tariffAssignment.upsert.mock.calls[0]![0] as {
      update: { tariffId: string; remainingSeconds: number; periodResetAt: Date };
    };
    expect(call.update.tariffId).toBe('t-pro');
    expect(call.update.remainingSeconds).toBe(6000 * 60);
    expect(call.update.periodResetAt).toBeInstanceOf(Date);
  });

  it('drops the org-wide fallback when the default flag is cleared', async () => {
    prismaMock.tariff.create.mockResolvedValue({ id: 't-x' });

    await svc.upsert('org1', 'admin', { name: 'X', period: 'MONTH', budgetMinutes: 60, isDefault: false } as never);

    expect(prismaMock.tariffAssignment.upsert).not.toHaveBeenCalled();
    expect(prismaMock.tariffAssignment.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ subjectType: 'ORG', tariffId: 't-x' }) }),
    );
  });
});
