import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the data + heavy dependency modules so importing the service under test
// pulls no Prisma client, Redis connection, or env validation.
const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    workspace: { findUnique: vi.fn() },
    deploymentZone: { findUnique: vi.fn(), findFirst: vi.fn() },
    session: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
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

const USER = { sub: 'user1', orgId: 'org1' } as never;

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
    prismaMock.session.findUnique.mockResolvedValue({ id: 'sess1', zoneId: 'zone1', containerId: 'c1' });
    prismaMock.deploymentZone.findUnique.mockResolvedValue({ id: 'zone1', name: 'default' });
    prismaMock.session.update.mockResolvedValue({});

    const res = await svc.terminate('sess1', USER);

    expect(prismaMock.session.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'TERMINATING' } }),
    );
    expect(redis.publish).toHaveBeenCalledWith(
      'chista:zone:default:destroy',
      expect.objectContaining({ sessionId: 'sess1', containerId: 'c1' }),
    );
    expect(res).toEqual({ ok: true });
  });

  it('throws when the session does not exist', async () => {
    prismaMock.session.findUnique.mockResolvedValue(null);
    await expect(svc.terminate('ghost', USER)).rejects.toThrow();
  });
});
