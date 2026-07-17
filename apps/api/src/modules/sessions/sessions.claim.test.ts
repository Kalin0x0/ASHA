import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Claim path of SessionsService.create(): handing a pre-warmed (staged)
// session to a launching user instead of a cold provision.
const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    workspace: { findUnique: vi.fn(), findFirst: vi.fn() },
    deploymentZone: { findUnique: vi.fn(), findFirst: vi.fn() },
    session: {
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      delete: vi.fn(),
    },
    agent: { findFirst: vi.fn(), updateMany: vi.fn() },
    volumeMapping: { findMany: vi.fn() },
    fileMapping: { findMany: vi.fn() },
    userGroup: { findMany: vi.fn() },
  },
}));

vi.mock('@asha/db', () => ({ prisma: prismaMock }));
vi.mock('../../common/audit.service', () => ({ AuditService: class {} }));
vi.mock('../../common/redis.service', () => ({ RedisService: class {} }));
vi.mock('./scheduler.service', () => ({ SchedulerService: class {} }));

import { SessionsService } from './sessions.service';

const WORKSPACE = {
  id: 'ws1',
  enabled: true,
  imageId: 'img1',
  image: { protocol: 'KASMVNC', dockerImage: 'kasmweb/firefox:1.16.0', runConfigDefaults: { ports: [6901] } },
  dockerConfig: {},
  coresLimit: 2,
  memLimitMb: 2048,
  gpuCount: 0,
  orgId: 'org1',
  friendlyName: 'Firefox',
};

const USER = { sub: 'user1', orgId: 'org1', email: 'user1@x.io', isSystemAdmin: false } as never;

const STAGED = {
  id: 'staged1',
  kasmId: 'kasm-staged',
  orgId: 'org1',
  workspaceId: 'ws1',
  zoneId: 'zone1',
  stagingId: 'rule1',
  status: 'RUNNING',
  connectionType: 'KASMVNC',
  internalHost: '10.0.0.9',
  port: 6901,
  userId: null,
};

describe('SessionsService.create — staged claim', () => {
  let svc: SessionsService;
  let scheduler: { pickAgent: ReturnType<typeof vi.fn>; pickZoneWithLiveAgent: ReturnType<typeof vi.fn> };
  let redis: { publish: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> };
  let audit: { record: ReturnType<typeof vi.fn> };
  let webhooks: { dispatch: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    scheduler = { pickAgent: vi.fn(), pickZoneWithLiveAgent: vi.fn().mockResolvedValue(null) };
    redis = { publish: vi.fn().mockResolvedValue(true), get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue(undefined) };
    audit = { record: vi.fn().mockResolvedValue(undefined) };
    webhooks = { dispatch: vi.fn().mockResolvedValue(undefined) };
    svc = new SessionsService(
      scheduler as never,
      redis as never,
      audit as never,
      undefined,
      webhooks as never,
    );

    prismaMock.workspace.findUnique.mockResolvedValue(WORKSPACE);
    prismaMock.deploymentZone.findFirst.mockResolvedValue({ id: 'zone1', name: 'default', isDefault: true });
    prismaMock.userGroup.findMany.mockResolvedValue([]);
    prismaMock.session.count.mockResolvedValue(0);
    prismaMock.session.findMany.mockResolvedValue([STAGED]);
    prismaMock.session.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.session.findUnique.mockResolvedValue({ ...STAGED, userId: 'user1' });
  });

  it('only considers pool sessions on a live agent (never hands out a dead one)', async () => {
    await svc.create(USER, { workspaceId: 'ws1' } as never);
    expect(prismaMock.session.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ agent: { status: 'ONLINE' } }) }),
    );
  });

  it('claims a ready staged session instead of provisioning', async () => {
    const res = await svc.create(USER, { workspaceId: 'ws1' } as never);

    expect(res).toMatchObject({ id: 'staged1', userId: 'user1' });
    // The claim is an atomic conditional update — only an unclaimed RUNNING row wins.
    expect(prismaMock.session.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'staged1', userId: null, status: 'RUNNING' },
        data: expect.objectContaining({ userId: 'user1', consumedSeconds: 0 }),
      }),
    );
    // No cold provision happened.
    expect(prismaMock.session.create).not.toHaveBeenCalled();
    expect(redis.publish).not.toHaveBeenCalled();
    // The user-facing lifecycle events fire for the claim.
    expect(webhooks.dispatch).toHaveBeenCalledWith('org1', 'session.created', expect.objectContaining({ userId: 'user1' }));
  });

  it('resets the claimer clock: fresh startedAt/keepalive, zero consumedSeconds', async () => {
    await svc.create(USER, { workspaceId: 'ws1' } as never);
    const data = prismaMock.session.updateMany.mock.calls[0]![0].data;
    expect(data.consumedSeconds).toBe(0);
    expect(data.startedAt).toBeInstanceOf(Date);
    expect(data.lastKeepaliveAt).toBeInstanceOf(Date);
  });

  it('falls through to a cold launch when a concurrent claimer wins the race', async () => {
    prismaMock.session.updateMany.mockResolvedValue({ count: 0 }); // raced — candidate gone
    scheduler.pickAgent.mockResolvedValue({ id: 'agent1', zoneId: 'zone1' });
    prismaMock.session.create.mockResolvedValue({ id: 'cold1', kasmId: 'kc', orgId: 'org1', zoneId: 'zone1' });
    prismaMock.session.findUnique.mockResolvedValue({ id: 'cold1' });
    prismaMock.session.update.mockResolvedValue({});
    prismaMock.volumeMapping.findMany.mockResolvedValue([]);
    prismaMock.fileMapping.findMany.mockResolvedValue([]);

    const res = await svc.create(USER, { workspaceId: 'ws1' } as never);
    expect(res).toMatchObject({ id: 'cold1' });
    expect(prismaMock.session.create).toHaveBeenCalled();
  });

  it('honours an explicitly requested zone when searching the pool', async () => {
    prismaMock.deploymentZone.findFirst.mockResolvedValue({ id: 'zone2', name: 'eu' });
    prismaMock.session.findMany.mockResolvedValue([]);
    scheduler.pickAgent.mockResolvedValue({ id: 'agent1', zoneId: 'zone2' });
    prismaMock.session.create.mockResolvedValue({ id: 'cold1', kasmId: 'kc', orgId: 'org1', zoneId: 'zone2' });
    prismaMock.session.update.mockResolvedValue({});
    prismaMock.volumeMapping.findMany.mockResolvedValue([]);
    prismaMock.fileMapping.findMany.mockResolvedValue([]);

    await svc.create(USER, { workspaceId: 'ws1', zoneId: 'zone2' } as never);
    expect(prismaMock.session.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ zoneId: 'zone2' }) }),
    );
  });

  it('refreshes the connection-proxy record with the claimer stamped on it', async () => {
    redis.get.mockResolvedValue({ sessionId: 'staged1', userId: null, rdpUser: 'kasm' });
    await svc.create(USER, { workspaceId: 'ws1' } as never);
    // Read-modify-write keeps agent-supplied fields (credentials) intact.
    expect(redis.set).toHaveBeenCalledWith(
      'asha:proxy:session:kasm-staged',
      expect.objectContaining({ userId: 'user1', rdpUser: 'kasm' }),
      3600,
    );
  });
});

describe('SessionsService.createStaged', () => {
  let svc: SessionsService;
  let scheduler: { pickAgent: ReturnType<typeof vi.fn>; pickZoneWithLiveAgent: ReturnType<typeof vi.fn> };
  let redis: { publish: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> };
  let audit: { record: ReturnType<typeof vi.fn> };

  const RULE = { id: 'rule1', orgId: 'org1', workspaceId: 'ws1', zoneId: 'zone1' };

  beforeEach(() => {
    vi.clearAllMocks();
    scheduler = { pickAgent: vi.fn(), pickZoneWithLiveAgent: vi.fn() };
    redis = { publish: vi.fn().mockResolvedValue(true), get: vi.fn(), set: vi.fn() };
    audit = { record: vi.fn().mockResolvedValue(undefined) };
    svc = new SessionsService(scheduler as never, redis as never, audit as never);

    prismaMock.workspace.findFirst.mockResolvedValue(WORKSPACE);
    prismaMock.deploymentZone.findFirst.mockResolvedValue({ id: 'zone1', name: 'default' });
    prismaMock.session.create.mockResolvedValue({ id: 'pool1', kasmId: 'kp', orgId: 'org1', zoneId: 'zone1' });
    prismaMock.session.update.mockResolvedValue({});
    prismaMock.session.findUnique.mockResolvedValue({ id: 'pool1', kasmId: 'kp', orgId: 'org1' });
    prismaMock.session.delete.mockResolvedValue({});
    prismaMock.volumeMapping.findMany.mockResolvedValue([]);
    prismaMock.fileMapping.findMany.mockResolvedValue([]);
  });

  it('creates an unclaimed pool session (userId null, stagingId set, no expiry)', async () => {
    scheduler.pickAgent.mockResolvedValue({ id: 'agent1', zoneId: 'zone1' });
    const res = await svc.createStaged(RULE);
    expect(res).toEqual({ ok: true, sessionId: 'pool1' });
    expect(prismaMock.session.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: null, stagingId: 'rule1', expiresAt: null }),
      }),
    );
    expect(redis.publish).toHaveBeenCalled(); // provision dispatched
  });

  it('reports no-agent as a reason and removes the just-created row (no ERROR clutter)', async () => {
    scheduler.pickAgent.mockResolvedValue(null);
    const res = await svc.createStaged(RULE);
    expect(res).toEqual({ ok: false, reason: expect.stringContaining('No ONLINE agent') });
    expect(prismaMock.session.delete).toHaveBeenCalledWith({ where: { id: 'pool1' } });
    expect(redis.publish).not.toHaveBeenCalled();
  });

  it('refuses to stage non-container workspaces', async () => {
    prismaMock.workspace.findFirst.mockResolvedValue({ ...WORKSPACE, type: 'SERVER' });
    const res = await svc.createStaged(RULE);
    expect(res).toEqual({ ok: false, reason: expect.stringContaining('container') });
    expect(prismaMock.session.create).not.toHaveBeenCalled();
  });

  it('retires the row and releases the agent slot when the message bus is down', async () => {
    scheduler.pickAgent.mockResolvedValue({ id: 'agent1', zoneId: 'zone1' });
    redis.publish.mockResolvedValue(false); // bus down → dispatchProvision throws
    const res = await svc.createStaged(RULE);
    expect(res).toMatchObject({ ok: false });
    expect(prismaMock.session.delete).toHaveBeenCalledWith({ where: { id: 'pool1' } });
    expect(prismaMock.agent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { currentSessions: { decrement: 1 } } }),
    );
  });
});
