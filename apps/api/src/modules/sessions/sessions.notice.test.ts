import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    session: { findFirst: vi.fn() },
    workspace: { findUnique: vi.fn() },
    userGroup: { findMany: vi.fn() },
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
    redis.get.mockResolvedValue({ observerUserId: 'admin1', observerName: 'Ada Lovelace', since: '2026-09-08T10:00:00.000Z' });
    const out = await svc.connection('sess1', OWNER);
    expect(redis.get).toHaveBeenCalledWith('asha:obs:watch:kid1');
    expect(out.notice.observedBy).toEqual({ observerName: 'Ada Lovelace', since: '2026-09-08T10:00:00.000Z' });
  });

  it('reports nobody watching when the watch key has expired or Redis is down', async () => {
    const out = await svc.connection('sess1', OWNER);
    expect(out.notice.observedBy).toBeNull();
  });

  it('falls back to GROUP/USER scope for a fixed-server session with no workspace', async () => {
    prismaMock.session.findFirst.mockResolvedValue({ ...SESSION, workspaceId: null });
    await svc.connection('sess1', OWNER);
    expect(watermarks.resolveForSession).toHaveBeenCalledWith('org1', expect.objectContaining({ workspaceId: '' }));
  });
});
