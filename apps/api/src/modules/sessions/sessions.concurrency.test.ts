import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the data + heavy dependency modules so importing the service under test
// pulls no Prisma client, Redis connection, or env validation. Mirrors the
// approach in sessions.service.test.ts.
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

const USER = { sub: 'user1', orgId: 'org1', email: 'user1@x.io', isSystemAdmin: true } as never;

describe('SessionsService.create — group concurrency limit', () => {
  let svc: SessionsService;
  let scheduler: { pickAgent: ReturnType<typeof vi.fn> };
  let redis: { publish: ReturnType<typeof vi.fn> };
  let audit: { record: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    scheduler = { pickAgent: vi.fn().mockResolvedValue(null) };
    redis = { publish: vi.fn().mockResolvedValue(undefined) };
    audit = { record: vi.fn().mockResolvedValue(undefined) };
    svc = new SessionsService(scheduler as never, redis as never, audit as never);

    prismaMock.workspace.findUnique.mockResolvedValue(WORKSPACE);
    prismaMock.deploymentZone.findFirst.mockResolvedValue({ id: 'zone1', name: 'default', isDefault: true });
    prismaMock.session.create.mockResolvedValue({ id: 'sess1', kasmId: 'kid', orgId: 'org1', zoneId: 'zone1' });
    prismaMock.session.findUnique.mockResolvedValue({ id: 'sess1', kasmId: 'kid', orgId: 'org1', zoneId: 'zone1' });
    prismaMock.session.update.mockResolvedValue({});
    prismaMock.volumeMapping.findMany.mockResolvedValue([]);
    prismaMock.fileMapping.findMany.mockResolvedValue([]);
  });

  it('allows a launch when the user is under their most restrictive group cap', async () => {
    // Member of two groups; effective limit is the minimum (2).
    prismaMock.userGroup.findMany.mockResolvedValue([
      { group: { maxConcurrentSessions: 5 } },
      { group: { maxConcurrentSessions: 2 } },
    ]);
    prismaMock.session.count.mockResolvedValue(1); // under the cap of 2

    await expect(svc.create(USER, { workspaceId: 'ws1' })).resolves.toBeDefined();
    expect(prismaMock.session.create).toHaveBeenCalled();
    expect(prismaMock.session.count).toHaveBeenCalledWith({
      where: { orgId: 'org1', userId: 'user1', status: { notIn: ['DESTROYED', 'TERMINATING', 'ERROR'] } },
    });
  });

  it('forbids a launch when active sessions reach the most restrictive group cap', async () => {
    prismaMock.userGroup.findMany.mockResolvedValue([
      { group: { maxConcurrentSessions: 5 } },
      { group: { maxConcurrentSessions: 2 } },
    ]);
    prismaMock.session.count.mockResolvedValue(2); // at the cap of 2

    await expect(svc.create(USER, { workspaceId: 'ws1' })).rejects.toThrow(/2/);
    // Gate runs before any session is created.
    expect(prismaMock.session.create).not.toHaveBeenCalled();
  });

  it('allows a launch when the user belongs to no group with a limit set', async () => {
    // Groups exist but none set maxConcurrentSessions → no group cap.
    prismaMock.userGroup.findMany.mockResolvedValue([
      { group: { maxConcurrentSessions: null } },
    ]);

    await expect(svc.create(USER, { workspaceId: 'ws1' })).resolves.toBeDefined();
    expect(prismaMock.session.create).toHaveBeenCalled();
    // No cap → we never need to count active sessions.
    expect(prismaMock.session.count).not.toHaveBeenCalled();
  });

  it('treats a 0 group cap as "no cap" (defensive) rather than a permanent lockout', async () => {
    // The API only accepts positive/null, but a stray 0 from a direct DB write
    // must not block every launch forever.
    prismaMock.userGroup.findMany.mockResolvedValue([
      { group: { maxConcurrentSessions: 0 } },
    ]);

    await expect(svc.create(USER, { workspaceId: 'ws1' })).resolves.toBeDefined();
    expect(prismaMock.session.create).toHaveBeenCalled();
    expect(prismaMock.session.count).not.toHaveBeenCalled();
  });
});
