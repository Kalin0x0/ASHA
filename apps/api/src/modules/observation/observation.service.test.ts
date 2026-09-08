import 'reflect-metadata';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    session: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
    setting: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));

vi.mock('@asha/db', () => ({ prisma: prismaMock, runUnscoped: (fn: () => unknown) => fn() }));

import { ObservationService } from './observation.service';

const CONTAINER_SESSION = {
  id: 'sess1',
  kasmId: 'kid1',
  orgId: 'org1',
  userId: 'worker1',
  zoneId: 'zone1',
  agentId: 'agent1',
  containerId: 'cont1',
  status: 'RUNNING',
};

// A fixed server (Rakhsh, Ahriman, …) runs no agent, so nothing inside it can
// take a frame.
const SERVER_SESSION = { ...CONTAINER_SESSION, id: 'sess2', kasmId: 'kid2', agentId: null, containerId: null };

const ADMIN = { sub: 'admin1', orgId: 'org1', email: 'admin@x.io', isSystemAdmin: true } as never;
const OPERATOR = { sub: 'op1', orgId: 'org1', email: 'op@x.io', isSystemAdmin: false } as never;
const WORKER = { sub: 'worker1', orgId: 'org1', email: 'worker@x.io', isSystemAdmin: false } as never;

const DTO = { intervalMs: 5_000, thumbWidth: 320 };

describe('ObservationService', () => {
  let svc: ObservationService;
  let sessions: { sendControl: ReturnType<typeof vi.fn> };
  let gateway: { emitToOrg: ReturnType<typeof vi.fn>; emitToSession: ReturnType<typeof vi.fn> };
  let redis: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn>; del: ReturnType<typeof vi.fn> };
  let security: { emit: ReturnType<typeof vi.fn> };
  let rbac: { effectivePermissions: ReturnType<typeof vi.fn> };
  let jwt: { signAsync: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    sessions = { sendControl: vi.fn().mockResolvedValue(undefined) };
    gateway = { emitToOrg: vi.fn(), emitToSession: vi.fn() };
    redis = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
      del: vi.fn().mockResolvedValue(undefined),
    };
    security = { emit: vi.fn().mockResolvedValue(undefined) };
    rbac = { effectivePermissions: vi.fn().mockResolvedValue(new Set<string>()) };
    jwt = { signAsync: vi.fn().mockResolvedValue('watch.token') };
    svc = new ObservationService(
      sessions as never,
      gateway as never,
      redis as never,
      security as never,
      rbac as never,
      jwt as never,
      { JWT_ACCESS_SECRET: 'access-secret' } as never,
    );
    prismaMock.session.findFirst.mockResolvedValue(CONTAINER_SESSION);
    prismaMock.setting.findUnique.mockResolvedValue(null);
    prismaMock.user.findUnique.mockResolvedValue({ displayName: 'Ada Lovelace', email: 'admin@x.io' });
  });

  describe('who may observe a given session', () => {
    it('lets a system admin observe anyone', async () => {
      await expect(svc.start(ADMIN, 'sess1', DTO)).resolves.toMatchObject({ watchToken: 'watch.token' });
      expect(rbac.effectivePermissions).not.toHaveBeenCalled();
    });

    it('lets a real SESSION_OBSERVE holder observe someone else', async () => {
      rbac.effectivePermissions.mockResolvedValue(new Set(['SESSION_OBSERVE']));
      await expect(svc.start(OPERATOR, 'sess1', DTO)).resolves.toMatchObject({ thumbnails: true });
    });

    it('refuses a caller who reached the route without the permission', async () => {
      // The route guard is not the last word: a row-level check has to re-derive
      // it, because the guard has no session context.
      await expect(svc.start(OPERATOR, 'sess1', DTO)).rejects.toThrow(ForbiddenException);
      expect(jwt.signAsync).not.toHaveBeenCalled();
      expect(security.emit).not.toHaveBeenCalled();
    });

    it('lets the owner watch their own session without any permission', async () => {
      await expect(svc.start(WORKER, 'sess1', DTO)).resolves.toMatchObject({ thumbnails: true });
      expect(rbac.effectivePermissions).not.toHaveBeenCalled();
    });

    it('scopes the lookup to the caller org, so a foreign session is simply absent', async () => {
      prismaMock.session.findFirst.mockResolvedValue(null);
      await expect(svc.start(ADMIN, 'other-org-session', DTO)).rejects.toThrow(NotFoundException);
      expect(prismaMock.session.findFirst).toHaveBeenCalledWith({
        where: { id: 'other-org-session', orgId: 'org1' },
      });
    });

    it('refuses an unclaimed pre-warmed session — nobody is at that desktop', async () => {
      prismaMock.session.findFirst.mockResolvedValue({ ...CONTAINER_SESSION, userId: null });
      await expect(svc.start(ADMIN, 'sess1', DTO)).rejects.toThrow(BadRequestException);
    });

    it('refuses a session that is not running', async () => {
      prismaMock.session.findFirst.mockResolvedValue({ ...CONTAINER_SESSION, status: 'PAUSED' });
      await expect(svc.start(ADMIN, 'sess1', DTO)).rejects.toThrow(/PAUSED/);
    });
  });

  describe('org policy switches', () => {
    it('refuses everything when observation.enabled is explicitly false', async () => {
      prismaMock.setting.findUnique.mockImplementation((args: { where: { scope_orgId_zoneId_key: { key: string } } }) =>
        args.where.scope_orgId_zoneId_key.key === 'observation.enabled' ? { valueJson: false } : null,
      );
      await expect(svc.start(ADMIN, 'sess1', DTO)).rejects.toThrow(ForbiddenException);
      expect(jwt.signAsync).not.toHaveBeenCalled();
      expect(sessions.sendControl).not.toHaveBeenCalled();
      expect(redis.set).not.toHaveBeenCalled();
    });

    it('treats an absent row as ON, so the notice goes out unconfigured', async () => {
      await svc.start(ADMIN, 'sess1', DTO);
      expect(gateway.emitToSession).toHaveBeenCalledWith('sess1', {
        type: 'session.observed',
        payload: expect.objectContaining({ observerName: 'Ada Lovelace', active: true }),
      });
      expect(security.emit).toHaveBeenCalledWith(
        expect.objectContaining({ metadata: expect.objectContaining({ notified: true }) }),
      );
    });

    it('records that the user was not told when observation.notifyUser is off', async () => {
      prismaMock.setting.findUnique.mockImplementation((args: { where: { scope_orgId_zoneId_key: { key: string } } }) =>
        args.where.scope_orgId_zoneId_key.key === 'observation.notifyUser' ? { valueJson: false } : null,
      );
      await svc.start(ADMIN, 'sess1', DTO);
      expect(gateway.emitToSession).not.toHaveBeenCalled();
      expect(security.emit).toHaveBeenCalledWith(
        expect.objectContaining({ metadata: expect.objectContaining({ notified: false }) }),
      );
    });
  });

  describe('capture', () => {
    it('asks the agent for frames on a container session and arms the dead-man switch', async () => {
      const res = await svc.start(ADMIN, 'sess1', DTO);
      expect(res.thumbnails).toBe(true);
      expect(res).not.toHaveProperty('reason');
      expect(sessions.sendControl).toHaveBeenCalledWith(
        CONTAINER_SESSION,
        { action: 'OBSERVE_START', kasmId: 'kid1', intervalMs: 5_000, ttlMs: 60_000, thumbWidth: 320 },
      );
    });

    it('takes no frame from a fixed server and says why', async () => {
      prismaMock.session.findFirst.mockResolvedValue(SERVER_SESSION);
      const res = await svc.start(ADMIN, 'sess2', DTO);
      expect(res).toMatchObject({ thumbnails: false, reason: 'no_agent' });
      expect(sessions.sendControl).not.toHaveBeenCalled();
      // The observation still happens — it is just metadata plus a view-only
      // stream — so it is still announced and still audited.
      expect(gateway.emitToSession).toHaveBeenCalled();
      expect(security.emit).toHaveBeenCalledWith(
        expect.objectContaining({ metadata: expect.objectContaining({ thumbnails: false }) }),
      );
    });

    it('captures nothing at interval 0', async () => {
      const res = await svc.start(ADMIN, 'sess1', { intervalMs: 0, thumbWidth: 320 });
      expect(res).toMatchObject({ thumbnails: false, reason: 'capture_disabled' });
      expect(sessions.sendControl).not.toHaveBeenCalled();
    });
  });

  describe('watch token and watch record', () => {
    it('mints a view-only token pinned to the session, and a 120 s window', async () => {
      const res = await svc.start(ADMIN, 'sess1', DTO);
      expect(jwt.signAsync).toHaveBeenCalledWith(
        { sub: 'admin1', orgId: 'org1', kasmId: 'kid1', mode: 'view' },
        { secret: 'access-secret', expiresIn: 120 },
      );
      expect(res.watchUrl).toBe('/connect/kid1?monitor=1&watch=watch.token');
      expect(Date.parse(res.expiresAt)).toBeGreaterThan(Date.now());
    });

    it('publishes who is watching so a viewer that reloads still shows the banner', async () => {
      await svc.start(ADMIN, 'sess1', DTO);
      expect(redis.set).toHaveBeenCalledWith(
        'asha:obs:watch:kid1',
        expect.objectContaining({ observerUserId: 'admin1', observerName: 'Ada Lovelace' }),
        90,
      );
    });
  });

  describe('stop', () => {
    it('clears the notice, stops the capture and audits the end of the window', async () => {
      redis.get.mockResolvedValue({ observerUserId: 'admin1', observerName: 'Ada Lovelace', since: '2026-09-08T10:00:00.000Z' });
      await svc.stop(ADMIN, 'sess1');
      expect(redis.del).toHaveBeenCalledWith('asha:obs:watch:kid1');
      expect(sessions.sendControl).toHaveBeenCalledWith(
        CONTAINER_SESSION,
        { action: 'OBSERVE_STOP', kasmId: 'kid1' },
      );
      // The event describes the window that ended: the observer who held it and
      // when it started, not whoever pressed stop.
      expect(gateway.emitToSession).toHaveBeenCalledWith('sess1', {
        type: 'session.observed',
        payload: { sessionId: 'sess1', observerName: 'Ada Lovelace', since: '2026-09-08T10:00:00.000Z', active: false },
      });
      expect(security.emit).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'observation.stop', severity: 'warn', targetId: 'sess1' }),
      );
    });

    it('refuses a caller who may not observe the session', async () => {
      await expect(svc.stop(OPERATOR, 'sess1')).rejects.toThrow(ForbiddenException);
      expect(redis.del).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('returns one entry per session that has a live sample', async () => {
      prismaMock.session.findMany.mockResolvedValue([
        { id: 'sess1', kasmId: 'kid1' },
        { id: 'sess2', kasmId: 'kid2' },
      ]);
      redis.get.mockImplementation((key: string) =>
        key === 'asha:obs:kid1'
          ? Promise.resolve({ kasmId: 'kid1', title: 'Excel', capturedAt: '2026-09-08T10:00:00.000Z' })
          : Promise.resolve(null),
      );
      const { items } = await svc.list(ADMIN);
      expect(items).toEqual([
        { kasmId: 'kid1', title: 'Excel', capturedAt: '2026-09-08T10:00:00.000Z', sessionId: 'sess1' },
      ]);
    });

    it('is empty rather than broken while Redis is down', async () => {
      prismaMock.session.findMany.mockResolvedValue([{ id: 'sess1', kasmId: 'kid1' }]);
      // RedisService silently no-ops and returns null when disconnected.
      redis.get.mockResolvedValue(null);
      await expect(svc.list(ADMIN)).resolves.toEqual({ items: [] });
    });
  });

  describe('agent ingest', () => {
    const SAMPLE = { kasmId: 'kid1', title: 'New Tab - Google Chrome', capturedAt: '2026-09-08T10:00:00.000Z' };

    beforeEach(() => {
      prismaMock.session.findUnique.mockResolvedValue({ id: 'sess1', orgId: 'org1' });
    });

    it('keeps the sample in Redis for 30 seconds and pushes it to the org', async () => {
      await svc.ingest('kid1', SAMPLE, { scope: 'global' });
      expect(redis.set).toHaveBeenCalledWith('asha:obs:kid1', SAMPLE, 30);
      expect(gateway.emitToOrg).toHaveBeenCalledWith('org1', {
        type: 'session.observation',
        payload: { ...SAMPLE, sessionId: 'sess1' },
      });
    });

    it('lets an org-scoped token feed its own org', async () => {
      await expect(svc.ingest('kid1', SAMPLE, { scope: 'org', orgId: 'org1', zoneId: null })).resolves.toEqual({
        ok: true,
      });
    });

    it('refuses an org-scoped token pointed at another tenant, and stores nothing', async () => {
      await expect(
        svc.ingest('kid1', SAMPLE, { scope: 'org', orgId: 'org2', zoneId: null }),
      ).rejects.toThrow(NotFoundException);
      expect(redis.set).not.toHaveBeenCalled();
      expect(gateway.emitToOrg).not.toHaveBeenCalled();
    });

    it('stores under the routed kasmId, not the one in the body', async () => {
      await svc.ingest('kid1', { ...SAMPLE, kasmId: 'someone-elses-kasm' }, { scope: 'global' });
      expect(redis.set).toHaveBeenCalledWith('asha:obs:kid1', expect.objectContaining({ kasmId: 'kid1' }), 30);
    });

    it('404s an unknown session', async () => {
      prismaMock.session.findUnique.mockResolvedValue(null);
      await expect(svc.ingest('nope', SAMPLE, { scope: 'global' })).rejects.toThrow(NotFoundException);
    });
  });
});
