import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the data + heavy dependency modules so importing the service under test
// pulls no Prisma client, Redis connection, or env validation.
const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    workspace: { findUnique: vi.fn() },
    deploymentZone: { findUnique: vi.fn(), findFirst: vi.fn() },
    session: { create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn() },
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
  let scheduler: { pickAgent: ReturnType<typeof vi.fn>; pickZoneWithLiveAgent: ReturnType<typeof vi.fn> };
  let redis: { publish: ReturnType<typeof vi.fn> };
  let audit: { record: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no live-agent zone surfaced → resolution falls through to the org
    // default zone (the `deploymentZone.findFirst` mock below).
    scheduler = { pickAgent: vi.fn(), pickZoneWithLiveAgent: vi.fn().mockResolvedValue(null) };
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
    prismaMock.userGroup.findMany.mockResolvedValue([]); // no group concurrency cap by default
    prismaMock.session.count.mockResolvedValue(0);
  });

  it('delegates a server-backed workspace to the server connect path (no container)', async () => {
    const serversMock = {
      connect: vi.fn().mockResolvedValue({
        sessionId: 'srv-sess',
        kasmId: 'k2',
        connectionUrl: 'https://x/session/k2/',
        connectionType: 'GUAC_RDP',
      }),
    };
    // servers is the last (8th) optional constructor arg.
    svc = new SessionsService(
      scheduler as never,
      redis as never,
      audit as never,
      undefined,
      undefined,
      undefined,
      undefined,
      serversMock as never,
    );
    prismaMock.workspace.findUnique.mockResolvedValue({
      ...WORKSPACE,
      id: 'ws-win',
      type: 'SERVER',
      serverId: 'srv1',
      image: null,
    });
    prismaMock.session.findUnique.mockResolvedValue({ id: 'srv-sess', kasmId: 'k2', connectionType: 'GUAC_RDP' });

    const result = await svc.create(USER, { workspaceId: 'ws-win' });

    expect(serversMock.connect).toHaveBeenCalledWith(USER, 'srv1');
    expect(scheduler.pickAgent).not.toHaveBeenCalled(); // never scheduled as a container
    expect(result).toMatchObject({ id: 'srv-sess' });
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
      'asha:zone:default:provision',
      expect.objectContaining({ sessionId: 'sess1', kasmId: 'kid', zone: 'default', protocol: 'KASMVNC' }),
    );
    expect(prismaMock.session.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'PROVISIONING' } }),
    );
    expect(audit.record).toHaveBeenCalled();
  });

  it('fails fast (ERROR + 503, no silent timeout) when no agent is available', async () => {
    scheduler.pickAgent.mockResolvedValue(null);

    // Regression guard for the recurring "Launch timed out before the workspace
    // became ready" hang: when no agent can take the session we surface the real
    // reason immediately instead of leaving it REQUESTED to time out.
    await expect(svc.create(USER, { workspaceId: 'ws1' })).rejects.toThrow(
      /no deployment agent is online/i,
    );

    // Marked ERROR with an actionable reason — never SCHEDULED, never provisioned.
    expect(prismaMock.session.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'ERROR' }) }),
    );
    expect(redis.publish).not.toHaveBeenCalled();
    expect(prismaMock.session.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'SCHEDULED' }) }),
    );
  });

  it('resolves an agent-less default zone to a zone that has a live agent', async () => {
    // The org default zone has no agent; pickZoneWithLiveAgent surfaces the zone
    // where an agent actually lives, so the session is created there (not in a
    // dead zone) and provisions normally. This is the durable, self-healing fix.
    scheduler.pickZoneWithLiveAgent.mockResolvedValue({ id: 'zoneLive', name: 'live' });
    scheduler.pickAgent.mockResolvedValue({ id: 'agent1', zoneId: 'zoneLive' });

    await svc.create(USER, { workspaceId: 'ws1' });

    expect(scheduler.pickAgent).toHaveBeenCalledWith('zoneLive');
    expect(prismaMock.session.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ zoneId: 'zoneLive' }) }),
    );
    expect(redis.publish).toHaveBeenCalledWith(
      'asha:zone:live:provision',
      expect.objectContaining({ zone: 'live' }),
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
      'asha:zone:default:destroy',
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
      'asha:zone:default:control',
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
      'asha:zone:default:control',
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
      'asha:zone:default:control',
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
