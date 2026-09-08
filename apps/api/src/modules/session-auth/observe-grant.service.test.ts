import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({ prismaMock: {} }));
// Pulled in only because the watch record's shape lives with the service that
// writes it; nothing here touches the database.
vi.mock('@asha/db', () => ({ prisma: prismaMock, runUnscoped: (fn: () => unknown) => fn() }));

import { ObserveGrantService } from './observe-grant.service';

/**
 * What the forward-auth gate leans on: whether one administrator's observation
 * of one session is still open, right now.
 *
 * The answers that matter are the refusals. An observe cookie lives in a browser
 * for as long as it was minted for, and stop, a lapsed hold, a withdrawn
 * permission and a Redis outage all have to reach it through this one read.
 */

const hold = (observerUserId: string, expiresAt: number) => ({
  observerUserId,
  observerName: 'Ada Lovelace',
  windowId: 'default',
  since: '2026-09-08T10:00:00.000Z',
  expiresAt,
});

describe('ObserveGrantService', () => {
  let redis: { get: ReturnType<typeof vi.fn> };
  let svc: ObserveGrantService;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-08T10:00:00.000Z'));
    redis = { get: vi.fn(async () => null) };
    svc = new ObserveGrantService(redis as never);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reads the record ObservationService writes, under its key', async () => {
    // A key of its own would drift from the one that puts the notice on the
    // watched person's screen, and then the credential and the notice would end
    // at different moments.
    await svc.holdExpiry('kid1', 'admin1');
    expect(redis.get).toHaveBeenCalledWith('asha:obs:watch:kid1');
  });

  it('answers with the observer’s own hold', async () => {
    const until = Date.now() + 90_000;
    redis.get.mockResolvedValue({ holds: [hold('admin1', until)] });
    expect(await svc.holdExpiry('kid1', 'admin1')).toBe(until);
  });

  it('will not lend one observer a colleague’s hold', async () => {
    // Two administrators watch the same desktop; one presses stop. The record
    // survives on the other's hold, so "does the key exist" would go on
    // authorizing the one who left.
    redis.get.mockResolvedValue({ holds: [hold('admin2', Date.now() + 90_000)] });
    expect(await svc.holdExpiry('kid1', 'admin1')).toBe(0);
  });

  it('ignores a hold that lapsed where it lies', async () => {
    // A closed laptop stops renewing. Holds are dropped by their own expiry,
    // not by the key's — the key lives as long as its longest hold.
    redis.get.mockResolvedValue({ holds: [hold('admin1', Date.now() - 1), hold('admin2', Date.now() + 90_000)] });
    expect(await svc.holdExpiry('kid1', 'admin1')).toBe(0);
  });

  it('takes the observer’s latest hold when they have several', async () => {
    // The wall keeps one hold per tile and the viewer it opens keeps its own.
    const later = Date.now() + 90_000;
    redis.get.mockResolvedValue({ holds: [hold('admin1', Date.now() + 10_000), hold('admin1', later)] });
    expect(await svc.holdExpiry('kid1', 'admin1')).toBe(later);
  });

  it('refuses when nothing is watching, and when Redis cannot say', async () => {
    // RedisService returns null for both, and both mean the same thing here:
    // the record is written through the same client, so with Redis away no hold
    // could have been opened either. Only observers pay for the refusal.
    redis.get.mockResolvedValue(null);
    expect(await svc.holdExpiry('kid1', 'admin1')).toBe(0);
  });

  it('refuses a request that names no observer', async () => {
    redis.get.mockResolvedValue({ holds: [hold('admin1', Date.now() + 90_000)] });
    expect(await svc.holdExpiry('kid1', undefined)).toBe(0);
    // And does not go to Redis to find that out.
    expect(redis.get).not.toHaveBeenCalled();
  });

  it('survives a record written by an older build', async () => {
    redis.get.mockResolvedValue({ observerUserId: 'admin1', since: 'x' });
    expect(await svc.holdExpiry('kid1', 'admin1')).toBe(0);
  });

  it('reads Redis once for a burst of requests on an open window', async () => {
    // The gate runs on every asset the KasmVNC client pulls, not only on the
    // stream upgrade.
    redis.get.mockResolvedValue({ holds: [hold('admin1', Date.now() + 90_000)] });
    for (let i = 0; i < 20; i += 1) await svc.holdExpiry('kid1', 'admin1');
    expect(redis.get).toHaveBeenCalledTimes(1);
  });

  it('caches no refusal, so a stop is not held off by the cache', async () => {
    redis.get.mockResolvedValue(null);
    await svc.holdExpiry('kid1', 'admin1');
    await svc.holdExpiry('kid1', 'admin1');
    expect(redis.get).toHaveBeenCalledTimes(2);
  });

  it('lets a hold lapse inside the cache window', async () => {
    // The cached copy is re-filtered rather than trusted: a hold that ends
    // between two reads ends for the gate as well.
    redis.get.mockResolvedValue({ holds: [hold('admin1', Date.now() + 1_000)] });
    expect(await svc.holdExpiry('kid1', 'admin1')).toBeGreaterThan(0);
    vi.advanceTimersByTime(1_500);
    expect(await svc.holdExpiry('kid1', 'admin1')).toBe(0);
    expect(redis.get).toHaveBeenCalledTimes(1);
  });

  it('re-reads once the cached copy is stale', async () => {
    redis.get.mockResolvedValue({ holds: [hold('admin1', Date.now() + 90_000)] });
    await svc.holdExpiry('kid1', 'admin1');
    vi.advanceTimersByTime(2_500);
    await svc.holdExpiry('kid1', 'admin1');
    expect(redis.get).toHaveBeenCalledTimes(2);
  });
});
