import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    user: { findFirst: vi.fn(), create: vi.fn() },
  },
}));

vi.mock('@asha/db', () => ({ prisma: prismaMock }));
vi.mock('@asha/crypto', () => ({ hashPassword: vi.fn(async () => 'hashed-secret') }));

import { UsersService } from './users.service';

const admin = { sub: 'admin1', orgId: 'org1', email: 'admin@asha.local', isSystemAdmin: true } as never;
const nonAdmin = { sub: 'u2', orgId: 'org1', email: 'u2@asha.local', isSystemAdmin: false } as never;

describe('UsersService.create', () => {
  let svc: UsersService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new UsersService();
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
