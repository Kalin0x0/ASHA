import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({ prismaMock: {} }));
vi.mock('@asha/db', () => ({ prisma: prismaMock, runUnscoped: (fn: () => unknown) => fn() }));

import { MaintenanceSchedulerService } from './maintenance-scheduler.service';

const svc = new MaintenanceSchedulerService({ run: vi.fn() } as never);
const base = { intervalMinutes: null, atMinuteOfDay: null, weekday: null } as const;

describe('MaintenanceSchedulerService.computeNext', () => {
  it('INTERVAL adds intervalMinutes', () => {
    const from = new Date('2026-06-24T10:00:00');
    const next = svc.computeNext({ ...base, scheduleKind: 'INTERVAL', intervalMinutes: 30 }, from);
    expect(next.getTime() - from.getTime()).toBe(30 * 60_000);
  });

  it('INTERVAL falls back to 60 minutes when unset', () => {
    const from = new Date('2026-06-24T10:00:00');
    const next = svc.computeNext({ ...base, scheduleKind: 'INTERVAL' }, from);
    expect(next.getTime() - from.getTime()).toBe(60 * 60_000);
  });

  it('DAILY runs later today when the time is still ahead', () => {
    const from = new Date('2026-06-24T10:00:00');
    const next = svc.computeNext({ ...base, scheduleKind: 'DAILY', atMinuteOfDay: 23 * 60 }, from); // 23:00
    expect(next.getHours()).toBe(23);
    expect(next.getMinutes()).toBe(0);
    expect(next.getDate()).toBe(from.getDate());
  });

  it('DAILY rolls to tomorrow when the time already passed', () => {
    const from = new Date('2026-06-24T10:00:00');
    const next = svc.computeNext({ ...base, scheduleKind: 'DAILY', atMinuteOfDay: 5 * 60 }, from); // 05:00
    expect(next.getHours()).toBe(5);
    expect(next.getTime()).toBeGreaterThan(from.getTime());
    expect(next.getDate()).toBe(from.getDate() + 1);
  });

  it('WEEKLY always lands on the target weekday in the future', () => {
    const from = new Date('2026-06-24T10:00:00');
    const next = svc.computeNext({ ...base, scheduleKind: 'WEEKLY', atMinuteOfDay: 9 * 60, weekday: 1 }, from); // Monday 09:00
    expect(next.getDay()).toBe(1);
    expect(next.getHours()).toBe(9);
    expect(next.getTime()).toBeGreaterThan(from.getTime());
  });
});
