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
  connectionType: 'KASMVNC',
  connectionUrl:
    'https://asha.example.com/session/kid1/?path=session/kid1/websockify&resize=remote&quality=8&enable_webp=true&token=stored',
  // A real Kasm image: the agent confirmed the read-only account answers.
  observeReady: true,
};

// A fixed server (Rakhsh, Ahriman, …) runs no agent, so nothing inside it can
// take a frame — and it streams through the connection-proxy, not Traefik.
const SERVER_SESSION = {
  ...CONTAINER_SESSION,
  id: 'sess2',
  kasmId: 'kid2',
  agentId: null,
  containerId: null,
  connectionType: 'GUAC_RDP',
  connectionUrl: null,
};

// A terminal has no second seat: guacd cannot join a running SSH connection, so
// the only "view" it could offer is a fresh login on the target.
const SSH_SESSION = { ...SERVER_SESSION, id: 'sess3', kasmId: 'kid3', connectionType: 'GUAC_SSH' };

const ADMIN = { sub: 'admin1', orgId: 'org1', email: 'admin@x.io', isSystemAdmin: true } as never;
const ADMIN2 = { sub: 'admin2', orgId: 'org1', email: 'bob@x.io', isSystemAdmin: true } as never;
const OPERATOR = { sub: 'op1', orgId: 'org1', email: 'op@x.io', isSystemAdmin: false } as never;
const WORKER = { sub: 'worker1', orgId: 'org1', email: 'worker@x.io', isSystemAdmin: false } as never;

const DTO = { intervalMs: 5_000, thumbWidth: 320 };
/** What the read-only viewer asks for: it is already looking at the desktop. */
const METADATA_ONLY = { intervalMs: 0, thumbWidth: 320 };

interface Hold {
  observerUserId: string;
  observerName: string;
  windowId: string;
  since: string;
  expiresAt: number;
}

/** The watch record as ObservationService keeps it: one entry per hold. */
const held = (...holds: Array<Partial<Hold> & { observerUserId: string }>) => ({
  holds: holds.map((h) => ({
    observerName: 'Ada Lovelace',
    windowId: 'default',
    since: '2026-09-08T10:00:00.000Z',
    expiresAt: Date.now() + 90_000,
    ...h,
  })),
});

describe('ObservationService', () => {
  let svc: ObservationService;
  let sessions: { sendControl: ReturnType<typeof vi.fn> };
  let gateway: {
    emitToOrg: ReturnType<typeof vi.fn>;
    emitToObservers: ReturnType<typeof vi.fn>;
    emitToSession: ReturnType<typeof vi.fn>;
  };
  let redis: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn>; del: ReturnType<typeof vi.fn> };
  let security: { emit: ReturnType<typeof vi.fn> };
  let rbac: { effectivePermissions: ReturnType<typeof vi.fn> };
  let jwt: { signAsync: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    sessions = { sendControl: vi.fn().mockResolvedValue(undefined) };
    gateway = { emitToOrg: vi.fn(), emitToObservers: vi.fn(), emitToSession: vi.fn() };
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
      { JWT_ACCESS_SECRET: 'access-secret', SESSION_TOKEN_SECRET: 'stream-secret', SESSION_TOKEN_TTL: 120 } as never,
    );
    prismaMock.session.findFirst.mockResolvedValue(CONTAINER_SESSION);
    prismaMock.setting.findUnique.mockResolvedValue(null);
    prismaMock.user.findUnique.mockResolvedValue({ displayName: 'Ada Lovelace', email: 'admin@x.io' });
  });

  /**
   * Redis standing in for itself, so a sequence of calls sees what the ones
   * before it wrote. Opening, renewing and releasing a hold are only correct in
   * relation to each other, and a `get` pinned to one value cannot show that.
   */
  function memoryRedis(): Map<string, unknown> {
    const store = new Map<string, unknown>();
    redis.get.mockImplementation((key: string) => Promise.resolve(store.get(key) ?? null));
    redis.set.mockImplementation((key: string, value: unknown) => {
      store.set(key, value);
      return Promise.resolve();
    });
    redis.del.mockImplementation((key: string) => {
      store.delete(key);
      return Promise.resolve();
    });
    return store;
  }

  type Notice = { observerName: string; since: string; active: boolean };

  const auditActions = (): string[] =>
    security.emit.mock.calls.map((call) => (call[0] as { action: string }).action);
  const notices = (): Notice[] =>
    gateway.emitToSession.mock.calls.map((call) => (call[1] as { payload: Notice }).payload);
  const storedHolds = (): Hold[] => {
    const last = redis.set.mock.calls.filter((call) => call[0] === 'asha:obs:watch:kid1').at(-1);
    return last ? (last[1] as { holds: Hold[] }).holds : [];
  };

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
        { sub: 'admin1', orgId: 'org1', kasmId: 'kid1', mode: 'view', typ: 'watch' },
        { secret: 'access-secret', expiresIn: 120 },
      );
      expect(Date.parse(res.expiresAt ?? '')).toBeGreaterThan(Date.now());
    });

    it('marks the watch token as a watch token, so the API refuses it as a credential', async () => {
      // It rides in the URL the observer is sent to — address bar, history,
      // every reverse-proxy access log — and it is signed with the secret that
      // authenticates the API. Without the marker, reading one out of a log buys
      // the observing admin's whole API for two minutes, minting further watch
      // tokens for other desktops included.
      await svc.start(ADMIN, 'sess1', DTO);
      const [claims] = jwt.signAsync.mock.calls[0] as [Record<string, unknown>];
      expect(claims.typ).toBe('watch');
    });

    it('does not give the stream token the watch marker', async () => {
      // The two are verified by different things under different secrets: this
      // one only ever reaches the Traefik forward-auth gate.
      await svc.start(ADMIN, 'sess1', DTO);
      const [claims] = jwt.signAsync.mock.calls[1] as [Record<string, unknown>];
      expect(claims).not.toHaveProperty('typ');
    });

    it('marks the stream token for the read-only route, so it cannot open the writing one', async () => {
      // The escalation this closes: the URL carrying this token is shown in the
      // observer's own address bar. Unmarked it is byte-identical to the token a
      // session's owner carries, and the gate does not know which router called
      // it — so moving it to `/session/<kasmId>/`, one segment up, traded it for
      // a cookie on the route Traefik serves with the KasmVNC account that may
      // type. SESSION_OBSERVE became keyboard and mouse control of a colleague's
      // desktop.
      await svc.start(ADMIN, 'sess1', DTO);
      const [claims] = jwt.signAsync.mock.calls[1] as [Record<string, unknown>];
      expect(claims.obs).toBe(true);
    });

    it('names the observer in the stream token, so the cookie can be tied to their hold', async () => {
      // Per hold rather than per session: one of two observers stopping has to
      // end their own access while the other keeps watching.
      await svc.start(ADMIN, 'sess1', DTO);
      const [claims] = jwt.signAsync.mock.calls[1] as [Record<string, unknown>];
      expect(claims.sub).toBe('admin1');
    });

    it('publishes who is watching so a viewer that reloads still shows the banner', async () => {
      await svc.start(ADMIN, 'sess1', DTO);
      expect(redis.set).toHaveBeenCalledWith(
        'asha:obs:watch:kid1',
        { holds: [expect.objectContaining({ observerUserId: 'admin1', observerName: 'Ada Lovelace' })] },
        // The hold's 90 s plus the grace the sweep needs to still find it there
        // once it has lapsed.
        120,
      );
    });

    it('caps the holds one observer can pile up on a session', async () => {
      // The window id is the caller's to choose. A caller that invents a new one
      // per request would otherwise grow the record without bound, and every
      // reader of it — the watched user's own connection fetch included — pays
      // for that on each read.
      memoryRedis();
      for (let i = 0; i < 12; i += 1) await svc.start(ADMIN, 'sess1', DTO, `w${i}`);
      expect(storedHolds()).toHaveLength(8);
      expect(storedHolds().map((h) => h.windowId)).toContain('w11');
    });

    it('refuses a window id that is not one', async () => {
      // Normalising it away would merge the wall's hold with the viewer's, which
      // is the collision the ids exist to prevent.
      await expect(svc.start(ADMIN, 'sess1', DTO, 'wall tile #1')).rejects.toThrow(BadRequestException);
      expect(redis.set).not.toHaveBeenCalled();
    });
  });

  describe('where the observer is sent', () => {
    it('offers no way in when the image has no read-only account', async () => {
      // The linuxserver desktops answer through nginx and ship no kasmvncpasswd,
      // so the observe route exists and 401s. Refusing here is what keeps an
      // admin out of a dead viewer.
      prismaMock.session.findFirst.mockResolvedValue({ ...CONTAINER_SESSION, observeReady: false });
      const res = await svc.start(ADMIN, 'sess1', DTO);
      expect(res.watchKind).toBe('none');
      expect(res.watchReason).toBe('no_viewer_account');
      expect(res.watchUrl).toBeUndefined();
      // Capture is unaffected: a tile without a live view still shows a frame.
      expect(res.thumbnails).toBe(true);
    });

    it('sends a fixed-server observer through the proxy, which joins guacd read-only', async () => {
      prismaMock.session.findFirst.mockResolvedValue(SERVER_SESSION);
      const res = await svc.start(ADMIN, 'sess2', DTO);
      expect(res).toMatchObject({
        watchKind: 'guac',
        watchUrl: '/connect/kid2?monitor=1&watch=watch.token',
      });
    });

    it('sends a container observer to the read-only route, because the proxy never sees it', async () => {
      // /connect/<kasmId> would render a viewer whose upgrade the proxy's
      // KasmVNC handler closes outright — the bug this branch exists to fix.
      jwt.signAsync.mockResolvedValueOnce('watch.token').mockResolvedValueOnce('stream.token');
      const res = await svc.start(ADMIN, 'sess1', DTO);
      expect(res.watchKind).toBe('iframe');
      expect(res.watchUrl).toBe(
        'https://asha.example.com/session/kid1/observe/?path=session/kid1/observe/websockify' +
          '&resize=remote&quality=8&enable_webp=true&token=stream.token',
      );
    });

    it('signs the stream token the Traefik gate wants, not the watch token again', async () => {
      await svc.start(ADMIN, 'sess1', DTO);
      expect(jwt.signAsync).toHaveBeenCalledWith(
        { sid: 'sess1', kasmId: 'kid1', sub: 'admin1', obs: true },
        { secret: 'stream-secret', expiresIn: 120 },
      );
    });

    it('never hands out the token stored on the session', async () => {
      // It was minted at launch with a 120 s life, so by now it is refused.
      const res = await svc.start(ADMIN, 'sess1', DTO);
      expect(res.watchUrl).not.toContain('token=stored');
    });

    it('falls back to the proxy URL for a container session with no stream URL', async () => {
      prismaMock.session.findFirst.mockResolvedValue({ ...CONTAINER_SESSION, connectionUrl: null });
      const res = await svc.start(ADMIN, 'sess1', DTO);
      expect(res).toMatchObject({ watchKind: 'guac', watchUrl: '/connect/kid1?monitor=1&watch=watch.token' });
    });
  });

  describe('sessions with nothing to watch', () => {
    beforeEach(() => {
      prismaMock.session.findFirst.mockResolvedValue(SSH_SESSION);
    });

    it('offers no live view on an SSH session, and says why in a token the UI can translate', async () => {
      const res = await svc.start(ADMIN, 'sess3', DTO);
      expect(res).toMatchObject({ watchKind: 'none', watchReason: 'no_shared_terminal' });
      expect(res.watchUrl).toBeUndefined();
    });

    it('mints no watch token for a connection guacd cannot join', async () => {
      // View mode on SSH is not a view at all: the proxy authenticates again as
      // the session user and allocates a second PTY — a real login in the host's
      // auth log, showing an empty shell rather than the one being worked in.
      const res = await svc.start(ADMIN, 'sess3', DTO);
      expect(res.watchToken).toBeUndefined();
      expect(jwt.signAsync).not.toHaveBeenCalled();
    });

    it('still opens the metadata window, announced and audited like any other', async () => {
      await svc.start(ADMIN, 'sess3', DTO);
      expect(notices()).toContainEqual(expect.objectContaining({ active: true }));
      expect(auditActions()).toEqual(['observation.start']);
    });
  });

  describe('the audit trail records the window, not the heartbeat', () => {
    it('writes one start row however often the window is renewed', async () => {
      // The wall re-posts every open tile every 20 s. Auditing each of those
      // buries the one entry that answers who watched whom, and when.
      memoryRedis();
      await svc.start(ADMIN, 'sess1', DTO);
      await svc.start(ADMIN, 'sess1', DTO);
      await svc.start(ADMIN, 'sess1', DTO);
      expect(auditActions()).toEqual(['observation.start']);
    });

    it('tells the watched user once and stays quiet on renewals', async () => {
      memoryRedis();
      await svc.start(ADMIN, 'sess1', DTO);
      await svc.start(ADMIN, 'sess1', DTO);
      expect(notices()).toHaveLength(1);
    });

    it('keeps asking the agent for frames on every renewal', async () => {
      // The dead-man switch is what the renewal is for; only the announcing and
      // the auditing are once-per-window.
      memoryRedis();
      await svc.start(ADMIN, 'sess1', DTO);
      await svc.start(ADMIN, 'sess1', DTO);
      expect(sessions.sendControl).toHaveBeenCalledTimes(2);
    });

    it('does not restart the clock the banner counts from', async () => {
      memoryRedis();
      await svc.start(ADMIN, 'sess1', DTO);
      const opened = storedHolds()[0].since;
      await svc.start(ADMIN, 'sess1', DTO);
      expect(storedHolds()[0].since).toBe(opened);
    });

    it('audits a window that reopens after the last one was released', async () => {
      memoryRedis();
      await svc.start(ADMIN, 'sess1', DTO);
      await svc.stop(ADMIN, 'sess1');
      await svc.start(ADMIN, 'sess1', DTO);
      expect(auditActions()).toEqual(['observation.start', 'observation.stop', 'observation.start']);
    });
  });

  describe('several observers on one desktop', () => {
    const ADA = { observerUserId: 'admin1', observerName: 'Ada Lovelace', since: '2026-09-08T10:00:00.000Z' };
    const BOB = { observerUserId: 'admin2', observerName: 'Bob Kahn', since: '2026-09-08T10:05:00.000Z' };

    beforeEach(() => {
      prismaMock.user.findUnique.mockImplementation((args: { where: { id: string } }) =>
        Promise.resolve(
          args.where.id === 'admin2'
            ? { displayName: 'Bob Kahn', email: 'bob@x.io' }
            : { displayName: 'Ada Lovelace', email: 'admin@x.io' },
        ),
      );
    });

    it('audits a second observer joining as a window of their own', async () => {
      const store = memoryRedis();
      store.set('asha:obs:watch:kid1', held(ADA));
      await svc.start(ADMIN2, 'sess1', DTO);
      expect(auditActions()).toEqual(['observation.start']);
      expect(storedHolds().map((h) => h.observerUserId)).toEqual(['admin1', 'admin2']);
    });

    it('leaves the banner on the observer who has been watching longest', async () => {
      const store = memoryRedis();
      store.set('asha:obs:watch:kid1', held(ADA));
      await svc.start(ADMIN2, 'sess1', DTO);
      expect(notices()).toEqual([{ sessionId: 'sess1', observerName: 'Ada Lovelace', since: ADA.since, active: true }]);
    });

    it('keeps the notice up when one of two observers stops', async () => {
      // The other one is still watching. Clearing the banner here is how an
      // observed person is told the watching ended while it goes on.
      const store = memoryRedis();
      store.set('asha:obs:watch:kid1', held(ADA, BOB));
      await svc.stop(ADMIN2, 'sess1');
      expect(store.has('asha:obs:watch:kid1')).toBe(true);
      expect(notices()).toEqual([{ sessionId: 'sess1', observerName: 'Ada Lovelace', since: ADA.since, active: true }]);
    });

    it('leaves the other observer their frames when one of two stops', async () => {
      const store = memoryRedis();
      store.set('asha:obs:watch:kid1', held(ADA, BOB));
      await svc.stop(ADMIN2, 'sess1');
      expect(sessions.sendControl).not.toHaveBeenCalled();
    });

    it('leaves no hold behind for the observer who stopped, while the other keeps theirs', async () => {
      // This record is what the connection-proxy reads to decide whether a
      // stream may continue. Keyed per session it cannot tell "this observer's
      // grant ended" from "all observation ended", so the observer who pressed
      // stop kept streaming on their colleague's hold until the token expired.
      const store = memoryRedis();
      store.set('asha:obs:watch:kid1', held(ADA, BOB));
      await svc.stop(ADMIN2, 'sess1');
      expect(storedHolds().map((h) => h.observerUserId)).toEqual(['admin1']);
      expect(store.has('asha:obs:watch:kid1')).toBe(true);
    });

    it('records that watching continued past this observer leaving', async () => {
      const store = memoryRedis();
      store.set('asha:obs:watch:kid1', held(ADA, BOB));
      await svc.stop(ADMIN2, 'sess1');
      expect(security.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'observation.stop',
          actorUserId: 'admin2',
          metadata: expect.objectContaining({ stillObserved: true }),
        }),
      );
    });

    it('clears the notice and stops the capture when the last observer leaves', async () => {
      const store = memoryRedis();
      store.set('asha:obs:watch:kid1', held(ADA, BOB));
      await svc.stop(ADMIN2, 'sess1');
      await svc.stop(ADMIN, 'sess1');
      expect(store.has('asha:obs:watch:kid1')).toBe(false);
      expect(sessions.sendControl).toHaveBeenCalledWith(CONTAINER_SESSION, {
        action: 'OBSERVE_STOP',
        kasmId: 'kid1',
      });
      expect(notices().at(-1)).toMatchObject({ active: false });
    });

    it('drops a hold whose observer stopped renewing rather than counting it', async () => {
      const store = memoryRedis();
      store.set('asha:obs:watch:kid1', { holds: [{ ...ADA, windowId: 'default', expiresAt: Date.now() - 1 }] });
      await svc.start(ADMIN2, 'sess1', DTO);
      expect(storedHolds().map((h) => h.observerUserId)).toEqual(['admin2']);
      expect(auditActions()).toEqual(['observation.start']);
    });
  });

  describe('handing a window from the wall to the viewer', () => {
    it('keeps the window open while the wall drops the tile the viewer took over', async () => {
      // Navigating into the live view unmounts the wall, which releases every
      // tile it held — including this session's. The viewer holds a window of
      // its own, so the observation the admin is about to carry out survives.
      memoryRedis();
      await svc.start(ADMIN, 'sess1', DTO);
      await svc.start(ADMIN, 'sess1', METADATA_ONLY, 'viewer1');
      await svc.stop(ADMIN, 'sess1');
      expect(redis.del).not.toHaveBeenCalled();
      expect(auditActions()).toEqual(['observation.start']);
      expect(notices()).toEqual([expect.objectContaining({ active: true })]);
    });

    it('counts the observer clock from the wall, not from the handover', async () => {
      memoryRedis();
      await svc.start(ADMIN, 'sess1', DTO);
      const opened = storedHolds()[0].since;
      await svc.start(ADMIN, 'sess1', METADATA_ONLY, 'viewer1');
      await svc.stop(ADMIN, 'sess1');
      expect(storedHolds()).toEqual([expect.objectContaining({ windowId: 'viewer1', since: opened })]);
    });

    it('ends the window when the viewer releases the last hold', async () => {
      memoryRedis();
      await svc.start(ADMIN, 'sess1', DTO);
      await svc.start(ADMIN, 'sess1', METADATA_ONLY, 'viewer1');
      await svc.stop(ADMIN, 'sess1');
      await svc.stop(ADMIN, 'sess1', 'viewer1');
      expect(redis.del).toHaveBeenCalledWith('asha:obs:watch:kid1');
      expect(auditActions()).toEqual(['observation.start', 'observation.stop']);
      expect(notices().at(-1)).toMatchObject({ active: false });
    });

    it('hands back the id of the window it opened', async () => {
      memoryRedis();
      await expect(svc.start(ADMIN, 'sess1', METADATA_ONLY, 'viewer1')).resolves.toMatchObject({
        windowId: 'viewer1',
      });
      await expect(svc.start(ADMIN, 'sess1', DTO)).resolves.toMatchObject({ windowId: 'default' });
    });
  });

  describe('stop', () => {
    it('clears the notice, stops the capture and audits the end of the window', async () => {
      redis.get.mockResolvedValue(held({ observerUserId: 'admin1' }));
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

    it('writes no second end for a window that has already ended', async () => {
      // The wall releases every tile it held on unmount, and a tile whose
      // session ended minutes ago is one of them.
      await svc.stop(ADMIN, 'sess1');
      expect(security.emit).not.toHaveBeenCalled();
      // The banner is cleared regardless: nobody is watching, and a stale one
      // left standing is the same lie in the other direction.
      expect(notices()).toEqual([expect.objectContaining({ active: false })]);
    });
  });

  describe('a hold that lapses instead of being released', () => {
    /** What the sweep reads: the live sessions a hold could be sitting under. */
    const WATCHED_ROW = {
      id: 'sess1',
      orgId: 'org1',
      kasmId: 'kid1',
      userId: 'worker1',
      zoneId: 'zone1',
      agentId: 'agent1',
      containerId: 'cont1',
    };
    const ADA = { observerUserId: 'admin1', observerName: 'Ada Lovelace', since: '2026-09-08T10:00:00.000Z' };
    const BOB = { observerUserId: 'admin2', observerName: 'Bob Kahn', since: '2026-09-08T10:05:00.000Z' };
    const lapsed = { expiresAt: Date.now() - 1 };

    beforeEach(() => {
      prismaMock.session.findMany.mockResolvedValue([WATCHED_ROW]);
    });

    it('takes the notice down and stops the capture when the last hold ran out', async () => {
      // The observer's browser died. Nothing releases their hold, and until the
      // sweep ran, the banner stayed up on the watched person's screen for the
      // rest of their session — saying they were being watched while nobody was.
      const store = memoryRedis();
      store.set('asha:obs:watch:kid1', held({ ...ADA, ...lapsed }));
      await expect(svc.sweepLapsedHolds()).resolves.toBe(1);
      expect(store.has('asha:obs:watch:kid1')).toBe(false);
      expect(sessions.sendControl).toHaveBeenCalledWith(WATCHED_ROW, { action: 'OBSERVE_STOP', kasmId: 'kid1' });
      expect(notices()).toEqual([
        { sessionId: 'sess1', observerName: 'Ada Lovelace', since: ADA.since, active: false },
      ]);
    });

    it('writes the stop the audit trail was missing, against the observer who left', async () => {
      const store = memoryRedis();
      store.set('asha:obs:watch:kid1', held({ ...ADA, ...lapsed }));
      await svc.sweepLapsedHolds();
      expect(security.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'observation.stop',
          actorUserId: 'admin1',
          targetId: 'sess1',
          metadata: expect.objectContaining({ reason: 'lapsed', stillObserved: false }),
        }),
      );
    });

    it('leaves a window nobody has walked away from alone', async () => {
      const store = memoryRedis();
      store.set('asha:obs:watch:kid1', held(ADA));
      await expect(svc.sweepLapsedHolds()).resolves.toBe(0);
      expect(redis.set).not.toHaveBeenCalled();
      expect(redis.del).not.toHaveBeenCalled();
      expect(gateway.emitToSession).not.toHaveBeenCalled();
      expect(security.emit).not.toHaveBeenCalled();
    });

    it('keeps the notice up for the observer still there, under their name', async () => {
      const store = memoryRedis();
      store.set('asha:obs:watch:kid1', held({ ...ADA, ...lapsed }, BOB));
      await svc.sweepLapsedHolds();
      expect(store.has('asha:obs:watch:kid1')).toBe(true);
      expect(sessions.sendControl).not.toHaveBeenCalled();
      expect(notices()).toEqual([
        { sessionId: 'sess1', observerName: 'Bob Kahn', since: BOB.since, active: true },
      ]);
      expect(security.emit).toHaveBeenCalledWith(
        expect.objectContaining({ actorUserId: 'admin1', metadata: expect.objectContaining({ stillObserved: true }) }),
      );
    });

    it('says nothing when one of an observer’s several surfaces goes quiet', async () => {
      // Their wall tile lapsed while the viewer they opened from it renews. The
      // window is one window; it has not ended.
      const store = memoryRedis();
      store.set('asha:obs:watch:kid1', held({ ...ADA, ...lapsed }, { ...ADA, windowId: 'viewer1' }));
      await expect(svc.sweepLapsedHolds()).resolves.toBe(0);
      expect(security.emit).not.toHaveBeenCalled();
      expect(gateway.emitToSession).not.toHaveBeenCalled();
      expect(storedHolds().map((h) => h.windowId)).toEqual(['viewer1']);
    });

    it('tears nothing down on an answer Redis could not give', async () => {
      // A disconnected Redis reads as null, which is not the same as nobody
      // watching — ending every observation on a hiccup would be its own defect.
      redis.get.mockResolvedValue(null);
      await expect(svc.sweepLapsedHolds()).resolves.toBe(0);
      expect(redis.del).not.toHaveBeenCalled();
      expect(security.emit).not.toHaveBeenCalled();
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

    it('keeps the sample in Redis for 30 seconds and pushes it to the observers', async () => {
      await svc.ingest('kid1', SAMPLE, { scope: 'global' });
      expect(redis.set).toHaveBeenCalledWith('asha:obs:kid1', SAMPLE, 30);
      expect(gateway.emitToObservers).toHaveBeenCalledWith('org1', {
        type: 'session.observation',
        payload: { ...SAMPLE, sessionId: 'sess1' },
      });
    });

    it('never puts a desktop frame in the org room, which every colleague is in', async () => {
      // The org room is joined on org membership alone. Fanning the sample out
      // there made a WebP of the desktop and the title of the focused window
      // readable by every signed-in employee, while the REST twin of the same
      // data demands SESSION_OBSERVE.
      await svc.ingest('kid1', { ...SAMPLE, image: 'UklGRg==' }, { scope: 'global' });
      expect(gateway.emitToOrg).not.toHaveBeenCalled();
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
      expect(gateway.emitToObservers).not.toHaveBeenCalled();
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
