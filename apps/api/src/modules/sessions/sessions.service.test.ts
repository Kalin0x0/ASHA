import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the data + heavy dependency modules so importing the service under test
// pulls no Prisma client, Redis connection, or env validation.
const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    workspace: { findUnique: vi.fn() },
    deploymentZone: { findUnique: vi.fn(), findFirst: vi.fn() },
    session: { create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
    volumeMapping: { findMany: vi.fn() },
    fileMapping: { findMany: vi.fn() },
  },
}));

vi.mock('@chista/db', () => ({ prisma: prismaMock }));
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

const NEKO_WORKSPACE = {
  ...WORKSPACE,
  id: 'ws-neko',
  image: {
    protocol: 'WEBRTC',
    dockerImage: 'ghcr.io/m1k1o/neko/firefox:latest',
    runConfigDefaults: {},
  },
  dockerConfig: { devices: ['/dev/video0', '/dev/snd'] },
};

const USER = { sub: 'user1', orgId: 'org1', email: 'user1@x.io', isSystemAdmin: true } as never;

describe('SessionsService.create', () => {
  let svc: SessionsService;
  let scheduler: { pickAgent: ReturnType<typeof vi.fn> };
  let redis: { publish: ReturnType<typeof vi.fn> };
  let audit: { record: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    scheduler = { pickAgent: vi.fn() };
    redis = { publish: vi.fn().mockResolvedValue(undefined) };
    audit = { record: vi.fn().mockResolvedValue(undefined) };
    svc = new SessionsService(scheduler as never, redis as never, audit as never);

    prismaMock.workspace.findUnique.mockResolvedValue(WORKSPACE);
    prismaMock.deploymentZone.findFirst.mockResolvedValue({ id: 'zone1', name: 'default', isDefault: true });
    prismaMock.session.create.mockResolvedValue({ id: 'sess1', kasmId: 'kid', orgId: 'org1', zoneId: 'zone1' });
    prismaMock.session.findUnique.mockResolvedValue({ id: 'sess1', kasmId: 'kid', orgId: 'org1', zoneId: 'zone1' });
    prismaMock.session.update.mockResolvedValue({});
    prismaMock.volumeMapping.findMany.mockResolvedValue([]); // E1: no admin volume mappings
    prismaMock.fileMapping.findMany.mockResolvedValue([]); // E4: no admin file mappings
  });

  it('creates → schedules → dispatches provision on the zone channel when an agent is free', async () => {
    scheduler.pickAgent.mockResolvedValue({ id: 'agent1' });

    await svc.create(USER, { workspaceId: 'ws1' });

    expect(prismaMock.session.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'REQUESTED', orgId: 'org1' }) }),
    );
    expect(prismaMock.session.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'SCHEDULED', agentId: 'agent1' }) }),
    );
    // Provision goes out on the resolved zone's channel (regression: zone name).
    expect(redis.publish).toHaveBeenCalledWith(
      'chista:zone:default:provision',
      expect.objectContaining({ sessionId: 'sess1', kasmId: 'kid', zone: 'default', protocol: 'KASMVNC' }),
    );
    expect(prismaMock.session.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'PROVISIONING' } }),
    );
    expect(audit.record).toHaveBeenCalled();
  });

  it('leaves the session unscheduled (no provision) when no agent is available', async () => {
    scheduler.pickAgent.mockResolvedValue(null);

    await svc.create(USER, { workspaceId: 'ws1' });

    expect(redis.publish).not.toHaveBeenCalled();
    expect(prismaMock.session.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'SCHEDULED' }) }),
    );
  });

  it('rejects a disabled or missing workspace', async () => {
    prismaMock.workspace.findUnique.mockResolvedValue(null);
    await expect(svc.create(USER, { workspaceId: 'nope' })).rejects.toThrow();
  });

  it('sets NEKO_WEBRTC connectionType and port 8080 for a WEBRTC workspace', async () => {
    scheduler.pickAgent.mockResolvedValue({ id: 'agent1' });
    prismaMock.workspace.findUnique.mockResolvedValue(NEKO_WORKSPACE);
    prismaMock.session.create.mockResolvedValue({ id: 'sess2', kasmId: 'kid2', orgId: 'org1', zoneId: 'zone1' });
    prismaMock.session.findUnique.mockResolvedValue({ id: 'sess2', kasmId: 'kid2', orgId: 'org1', zoneId: 'zone1' });

    await svc.create(USER, { workspaceId: 'ws-neko' });

    expect(prismaMock.session.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ connectionType: 'NEKO_WEBRTC' }) }),
    );
    expect(redis.publish).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        protocol: 'WEBRTC',
        runConfig: expect.objectContaining({
          ports: [8080],
          devices: ['/dev/video0', '/dev/snd'],
        }),
      }),
    );
  });
});

describe('SessionsService.terminate', () => {
  let svc: SessionsService;
  let redis: { publish: ReturnType<typeof vi.fn> };
  let audit: { record: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    redis = { publish: vi.fn().mockResolvedValue(undefined) };
    audit = { record: vi.fn().mockResolvedValue(undefined) };
    svc = new SessionsService({} as never, redis as never, audit as never);
  });

  it('marks TERMINATING and publishes a destroy command on the zone channel', async () => {
    prismaMock.session.findFirst.mockResolvedValue({ id: 'sess1', orgId: 'org1', zoneId: 'zone1', containerId: 'c1' });
    prismaMock.deploymentZone.findUnique.mockResolvedValue({ id: 'zone1', name: 'default' });
    prismaMock.session.updateMany.mockResolvedValue({ count: 1 });

    const res = await svc.terminate('sess1', USER);

    // destroy() is idempotent: the TERMINATING transition is a guarded updateMany.
    expect(prismaMock.session.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'TERMINATING', terminationReason: 'admin_terminate' } }),
    );
    expect(redis.publish).toHaveBeenCalledWith(
      'chista:zone:default:destroy',
      expect.objectContaining({ sessionId: 'sess1', containerId: 'c1' }),
    );
    expect(res).toEqual({ ok: true });
  });

  it('throws when the session does not exist', async () => {
    prismaMock.session.findFirst.mockResolvedValue(null);
    await expect(svc.terminate('ghost', USER)).rejects.toThrow();
  });
});

describe('SessionsService pause / resume / resize', () => {
  let svc: SessionsService;
  let redis: { publish: ReturnType<typeof vi.fn> };
  let audit: { record: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    redis = { publish: vi.fn().mockResolvedValue(undefined) };
    audit = { record: vi.fn().mockResolvedValue(undefined) };
    svc = new SessionsService({} as never, redis as never, audit as never);
    prismaMock.deploymentZone.findUnique.mockResolvedValue({ id: 'zone1', name: 'default' });
    prismaMock.session.update.mockResolvedValue({});
  });

  it('pauses a RUNNING session: emits PAUSE control + sets PAUSED', async () => {
    prismaMock.session.findFirst.mockResolvedValue({ id: 's1', orgId: 'org1', zoneId: 'zone1', containerId: 'c1', status: 'RUNNING' });
    const res = await svc.pause('s1', USER);
    expect(redis.publish).toHaveBeenCalledWith(
      'chista:zone:default:control',
      expect.objectContaining({ sessionId: 's1', action: 'PAUSE', containerId: 'c1' }),
    );
    expect(prismaMock.session.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PAUSED' }) }),
    );
    expect(res).toEqual({ ok: true });
  });

  it('refuses to pause a session that is not RUNNING/DEGRADED', async () => {
    prismaMock.session.findFirst.mockResolvedValue({ id: 's1', orgId: 'org1', zoneId: 'zone1', containerId: 'c1', status: 'PROVISIONING' });
    await expect(svc.pause('s1', USER)).rejects.toThrow(/expected one of/);
    expect(redis.publish).not.toHaveBeenCalled();
  });

  it('resumes only a PAUSED session', async () => {
    prismaMock.session.findFirst.mockResolvedValue({ id: 's1', orgId: 'org1', zoneId: 'zone1', containerId: 'c1', status: 'PAUSED' });
    await svc.resume('s1', USER);
    expect(redis.publish).toHaveBeenCalledWith(
      'chista:zone:default:control',
      expect.objectContaining({ action: 'RESUME' }),
    );
    expect(prismaMock.session.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'RUNNING' }) }),
    );
  });

  it('emits a RESIZE control frame with geometry', async () => {
    prismaMock.session.findFirst.mockResolvedValue({ id: 's1', orgId: 'org1', zoneId: 'zone1', containerId: 'c1', status: 'RUNNING' });
    await svc.resize('s1', 1920, 1080, USER);
    expect(redis.publish).toHaveBeenCalledWith(
      'chista:zone:default:control',
      expect.objectContaining({ action: 'RESIZE', width: 1920, height: 1080 }),
    );
  });
});

describe('SessionsService ownership (non-admin)', () => {
  let svc: SessionsService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new SessionsService(
      {} as never,
      { publish: vi.fn().mockResolvedValue(undefined) } as never,
      { record: vi.fn().mockResolvedValue(undefined) } as never,
    );
    prismaMock.workspace.findUnique.mockResolvedValue({ dlp: {} });
  });

  const OWNER = { sub: 'owner1', orgId: 'org1', isSystemAdmin: false } as never;

  it('lets the owner read their own session connection', async () => {
    prismaMock.session.findFirst.mockResolvedValue({
      id: 's1', orgId: 'org1', userId: 'owner1', workspaceId: 'ws1', connectionUrl: 'https://x', status: 'RUNNING',
    });
    await expect(svc.connection('s1', OWNER)).resolves.toMatchObject({ status: 'RUNNING' });
  });

  it('forbids a non-owner non-admin from another user’s session', async () => {
    prismaMock.session.findFirst.mockResolvedValue({
      id: 's1', orgId: 'org1', userId: 'someone-else', workspaceId: 'ws1', connectionUrl: 'https://x', status: 'RUNNING',
    });
    await expect(svc.connection('s1', OWNER)).rejects.toThrow(/access/i);
  });
});
