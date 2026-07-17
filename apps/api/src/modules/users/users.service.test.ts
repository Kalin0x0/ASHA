import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    user: { findFirst: vi.fn(), create: vi.fn(), delete: vi.fn(), count: vi.fn() },
    session: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

vi.mock('@asha/db', () => ({ prisma: prismaMock }));
vi.mock('@asha/crypto', () => ({ hashPassword: vi.fn(async () => 'hashed-secret') }));

import { UsersService } from './users.service';

const admin = { sub: 'admin1', orgId: 'org1', email: 'admin@asha.local', isSystemAdmin: true } as never;
const nonAdmin = { sub: 'u2', orgId: 'org1', email: 'u2@asha.local', isSystemAdmin: false } as never;

const sessions = { destroy: vi.fn().mockResolvedValue(true) };

describe('UsersService.create', () => {
  let svc: UsersService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new UsersService(sessions as never);
  });

  it('creates a user, lowercasing email + defaulting username, with a hashed password credential', async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);
    prismaMock.user.create.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
      id: 'new1',
      ...args.data,
    }));

    await svc.create(admin, { email: 'New.User@Asha.LOCAL', password: 'supersecret' });

    const arg = prismaMock.user.create.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(arg.data.email).toBe('new.user@asha.local');
    expect(arg.data.username).toBe('new.user@asha.local');
    expect(arg.data.status).toBe('ACTIVE');
    // password is stored as a hashed credential, never in plaintext
    expect(JSON.stringify(arg.data)).not.toContain('supersecret');
    expect(JSON.stringify(arg.data)).toContain('hashed-secret');
  });

  it('rejects a duplicate email/username with a conflict', async () => {
    prismaMock.user.findFirst.mockResolvedValue({ id: 'existing' });
    await expect(svc.create(admin, { email: 'dupe@asha.local' })).rejects.toThrow(/already exists/i);
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it('forbids a non-admin from minting a system admin', async () => {
    await expect(
      svc.create(nonAdmin, { email: 'x@asha.local', isSystemAdmin: true }),
    ).rejects.toThrow(/system.admin/i);
    expect(prismaMock.user.findFirst).not.toHaveBeenCalled();
  });
});

describe('UsersService.remove', () => {
  let svc: UsersService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new UsersService(sessions as never);
  });

  it('drains the user\'s live sessions before deleting (no orphaned containers)', async () => {
    prismaMock.user.findFirst.mockResolvedValue({ id: 'victim', orgId: 'org1', isSystemAdmin: false });
    prismaMock.session.findMany.mockResolvedValue([
      { id: 's1', orgId: 'org1', zoneId: 'z1', containerId: 'c1', kasmId: 'k1', agentId: 'a1' },
      { id: 's2', orgId: 'org1', zoneId: 'z1', containerId: null, kasmId: 'k2', agentId: null },
    ]);
    prismaMock.user.delete.mockResolvedValue({});

    await svc.remove(admin, 'victim');

    // Every non-terminal session torn down first…
    expect(sessions.destroy).toHaveBeenCalledWith(expect.objectContaining({ id: 's1' }), 'user_deleted');
    expect(sessions.destroy).toHaveBeenCalledWith(expect.objectContaining({ id: 's2' }), 'user_deleted');
    // …and only excludes already-terminal ones.
    expect(prismaMock.session.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'victim',
          status: { notIn: ['DESTROYED', 'TERMINATING', 'ERROR'] },
        }),
      }),
    );
    expect(prismaMock.user.delete).toHaveBeenCalledWith({ where: { id: 'victim' } });
  });

  it('refuses to delete your own account', async () => {
    await expect(svc.remove(admin, 'admin1')).rejects.toThrow(/own account/i);
    expect(sessions.destroy).not.toHaveBeenCalled();
  });
});
