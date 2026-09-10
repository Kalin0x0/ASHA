import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    session: { findFirst: vi.fn() },
    workspace: { findUnique: vi.fn() },
    userGroup: { findMany: vi.fn() },
    setting: { findUnique: vi.fn() },
  },
}));

vi.mock('@asha/db', () => ({ prisma: prismaMock }));
vi.mock('../../common/audit.service', () => ({ AuditService: class {} }));
vi.mock('../../common/redis.service', () => ({ RedisService: class {} }));
vi.mock('./scheduler.service', () => ({ SchedulerService: class {} }));

import { SessionsService } from './sessions.service';

const SESSION = {
  id: 'sess1',
  kasmId: 'kid1',
  orgId: 'org1',
  userId: 'worker1',
  workspaceId: 'ws1',
  status: 'RUNNING',
  connectionUrl: 'https://asha.example.com/session/kid1/',
  errorMessage: null,
  streamProfile: {},
};

const OWNER = { sub: 'worker1', orgId: 'org1', email: 'worker@x.io', isSystemAdmin: false } as never;

const HOLD = {
  observerUserId: 'admin1',
  observerName: 'Ada Lovelace',
  windowId: 'default',
  since: '2026-09-08T10:00:00.000Z',
  expiresAt: Date.now() + 90_000,
};

/** The watch record ObservationService keeps: one entry per hold on the session. */
const watching = (...holds: Array<Partial<typeof HOLD>>) => ({
  holds: holds.map((h) => ({ ...HOLD, ...h })),
});

/**
 * The viewer learns from `connection()` what it has to paint over the desktop:
 * the configured banner/watermark, and whether an administrator is watching. It
 * rides on the call the viewer already makes before the first frame — a route of
 * its own would put the notice a round trip behind the picture.
 */
describe('SessionsService.connection — viewer notice', () => {
  let svc: SessionsService;
  let redis: { get: ReturnType<typeof vi.fn> };
  let watermarks: { resolveForSession: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    redis = { get: vi.fn().mockResolvedValue(null) };
    watermarks = { resolveForSession: vi.fn().mockResolvedValue(null) };
    svc = new SessionsService(
      {} as never, // scheduler
      redis as never,
      { record: vi.fn() } as never, // audit
      undefined, undefined, undefined, undefined, undefined, undefined, undefined,
      undefined, undefined,
      watermarks as never,
    );
    prismaMock.session.findFirst.mockResolvedValue(SESSION);
    prismaMock.workspace.findUnique.mockResolvedValue({ id: 'ws1', dlp: {} });
    prismaMock.userGroup.findMany.mockResolvedValue([{ groupId: 'g1' }]);
    prismaMock.setting.findUnique.mockResolvedValue(null);
  });

  it('resolves the banner/watermark for the user at the desktop, not the caller', async () => {
    watermarks.resolveForSession.mockResolvedValue({
      bannerText: 'VERTRAULICH',
      bannerColor: '#d4af37',
      watermarkText: 'worker1',
      watermarkOpacity: 0.2,
    });
    const out = await svc.connection('sess1', OWNER);
    expect(watermarks.resolveForSession).toHaveBeenCalledWith('org1', {
      userId: 'worker1',
      groupIds: ['g1'],
      workspaceId: 'ws1',
    });
    expect(out.notice.watermark).toMatchObject({ bannerText: 'VERTRAULICH' });
  });

  it('reports the observer so a viewer that reloads mid-observation still shows the banner', async () => {
    redis.get.mockResolvedValue(watching({ observerUserId: 'admin1', observerName: 'Ada Lovelace' }));
    const out = await svc.connection('sess1', OWNER);
    expect(redis.get).toHaveBeenCalledWith('asha:obs:watch:kid1');
    expect(out.notice.observedBy).toEqual({
      observerName: 'Ada Lovelace',
      since: '2026-09-08T10:00:00.000Z',
      observerCount: 1,
    });
  });

  it('names the observer who has been watching longest and counts the rest', async () => {
    redis.get.mockResolvedValue(
      watching(
        { observerUserId: 'admin2', observerName: 'Bob Kahn', since: '2026-09-08T10:05:00.000Z' },
        { observerUserId: 'admin1', observerName: 'Ada Lovelace' },
      ),
    );
    const out = await svc.connection('sess1', OWNER);
    expect(out.notice.observedBy).toEqual({
      observerName: 'Ada Lovelace',
      since: '2026-09-08T10:00:00.000Z',
      observerCount: 2,
    });
  });

  it('counts one observer once, however many windows they hold', async () => {
    // The wall's tile and the read-only viewer opened from it are two holds by
    // the same person; the banner must not read as two administrators.
    redis.get.mockResolvedValue(
      watching(
        { observerUserId: 'admin1', observerName: 'Ada Lovelace' },
        { observerUserId: 'admin1', observerName: 'Ada Lovelace', windowId: 'viewer1' },
      ),
    );
    const out = await svc.connection('sess1', OWNER);
    expect(out.notice.observedBy).toMatchObject({ observerCount: 1 });
  });

  it('reports nobody watching when the watch key has expired or Redis is down', async () => {
    const out = await svc.connection('sess1', OWNER);
    expect(out.notice.observedBy).toBeNull();
  });

  it('reports nobody watching once every hold has lapsed', async () => {
    // The key lives as long as its longest hold, so an observer who stopped
    // renewing can still be sitting in a record that has not expired.
    redis.get.mockResolvedValue({
      holds: [{ ...HOLD, expiresAt: Date.now() - 1 }],
    });
    const out = await svc.connection('sess1', OWNER);
    expect(out.notice.observedBy).toBeNull();
  });

  it('says nobody is watching when the org switched the notice off', async () => {
    // The observation is audited as unannounced then, so the payload the viewer
    // paints its banner from must not announce it either.
    redis.get.mockResolvedValue(watching({}));
    prismaMock.setting.findUnique.mockResolvedValue({ valueJson: false });
    const out = await svc.connection('sess1', OWNER);
    expect(prismaMock.setting.findUnique).toHaveBeenCalledWith({
      where: { scope_orgId_zoneId_key: { scope: 'ORG', orgId: 'org1', zoneId: '', key: 'observation.notifyUser' } },
      select: { valueJson: true },
    });
    expect(out.notice.observedBy).toBeNull();
  });

  it('does not go looking for the policy while nobody is watching', async () => {
    await svc.connection('sess1', OWNER);
    expect(prismaMock.setting.findUnique).not.toHaveBeenCalled();
  });

  it('falls back to GROUP/USER scope for a fixed-server session with no workspace', async () => {
    prismaMock.session.findFirst.mockResolvedValue({ ...SESSION, workspaceId: null });
    await svc.connection('sess1', OWNER);
    expect(watermarks.resolveForSession).toHaveBeenCalledWith('org1', expect.objectContaining({ workspaceId: '' }));
  });

  /**
   * What the gateway replays into a socket joining the session room. The push
   * only ever fires on a transition, so a viewer that was disconnected for one
   * has no way back to the truth without this.
   */
  describe('observedState', () => {
    const SEED = { id: 'sess1', orgId: 'org1', kasmId: 'kid1', userId: 'worker1' };

    it('reports the observation a reconnecting viewer missed the start of', async () => {
      redis.get.mockResolvedValue(watching({}));
      await expect(svc.observedState(SEED)).resolves.toEqual({
        sessionId: 'sess1',
        observerName: 'Ada Lovelace',
        since: '2026-09-08T10:00:00.000Z',
        active: true,
      });
    });

    it('retracts a banner whose stop the viewer was away for', async () => {
      const state = await svc.observedState(SEED);
      expect(state.active).toBe(false);
    });

    it('reports nobody watching once every hold has lapsed', async () => {
      // The record outlives its last hold on purpose, so the sweep has something
      // to read; a record that still exists is not an observation still running.
      redis.get.mockResolvedValue(watching({ expiresAt: Date.now() - 1 }));
      const state = await svc.observedState(SEED);
      expect(state.active).toBe(false);
    });

    it('stays quiet about an observation the org switched the notice off for', async () => {
      redis.get.mockResolvedValue(watching({}));
      prismaMock.setting.findUnique.mockResolvedValue({ valueJson: false });
      const state = await svc.observedState(SEED);
      expect(state).toMatchObject({ active: false, observerName: '' });
    });

    it('answers for a fixed-server session that has no kasmId at all', async () => {
      const state = await svc.observedState({ ...SEED, kasmId: null });
      expect(state.active).toBe(false);
      expect(redis.get).not.toHaveBeenCalled();
    });
  });
});
