import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    apiKey: {
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    group: {
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    userGroup: {
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock('@chista/db', () => ({ prisma: prismaMock }));
vi.mock('@chista/crypto', () => ({
  hashToken: (t: string) => `hashed:${t}`,
  randomToken: () => 'random-token-hex',
}));

import { ScimService } from './scim.service';

const ORG = 'org1';

describe('ScimService', () => {
  let service: ScimService;

  beforeEach(() => {
    service = new ScimService();
    vi.clearAllMocks();
    prismaMock.userGroup.create.mockResolvedValue({});
    prismaMock.userGroup.deleteMany.mockResolvedValue({ count: 0 });
  });

  // ── Token auth ──────────────────────────────────────────────────────────────

  it('validates bearer token against hashed ApiKey', async () => {
    prismaMock.apiKey.findFirst.mockResolvedValue({ id: 'k1', expiresAt: null });
    await expect(service.validateBearerToken(ORG, 'raw-token')).resolves.toBeUndefined();
    expect(prismaMock.apiKey.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ hashedKey: 'hashed:raw-token' }) }),
    );
  });

  it('throws on invalid bearer token', async () => {
    prismaMock.apiKey.findFirst.mockResolvedValue(null);
    await expect(service.validateBearerToken(ORG, 'bad')).rejects.toThrow('Invalid SCIM bearer token');
  });

  // ── Users ───────────────────────────────────────────────────────────────────

  it('lists users with SCIM envelope', async () => {
    const users = [
      { id: 'u1', email: 'a@example.com', username: 'a', displayName: null, externalId: null, status: 'ACTIVE', createdAt: new Date(), updatedAt: new Date() },
    ];
    prismaMock.user.findMany.mockResolvedValue(users);
    prismaMock.user.count.mockResolvedValue(1);
    const result = await service.listUsers(ORG, 1, 10);
    expect(result.schemas[0]).toContain('ListResponse');
    expect(result.totalResults).toBe(1);
    expect(result.Resources[0].userName).toBe('a');
  });

  it('creates user and returns SCIM resource', async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);
    const u = { id: 'u2', email: 'b@test.com', username: 'b', displayName: null, externalId: null, status: 'ACTIVE', createdAt: new Date(), updatedAt: new Date() };
    prismaMock.user.create.mockResolvedValue(u);
    const res = await service.createUser(ORG, { userName: 'b', emails: [{ value: 'b@test.com' }] });
    expect(res.id).toBe('u2');
    expect(res.active).toBe(true);
  });

  it('patches user active → DISABLED', async () => {
    const u = { id: 'u3', email: 'c@test.com', username: 'c', displayName: null, externalId: null, status: 'ACTIVE', createdAt: new Date(), updatedAt: new Date() };
    prismaMock.user.findFirst.mockResolvedValue(u);
    prismaMock.user.update.mockResolvedValue({ ...u, status: 'DISABLED' });
    const res = await service.patchUser(ORG, 'u3', [{ op: 'replace', path: 'active', value: false }]);
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'DISABLED' }) }),
    );
    expect(res.active).toBe(false);
  });

  // ── Groups ──────────────────────────────────────────────────────────────────

  it('lists groups with members', async () => {
    const groups = [
      { id: 'g1', orgId: ORG, name: 'Admins', createdAt: new Date(), updatedAt: new Date(), members: [] },
    ];
    prismaMock.group.findMany.mockResolvedValue(groups);
    prismaMock.group.count.mockResolvedValue(1);
    const res = await service.listGroups(ORG, 1, 10);
    expect(res.totalResults).toBe(1);
    expect(res.Resources[0].displayName).toBe('Admins');
  });

  it('deletes a group', async () => {
    prismaMock.group.findFirst.mockResolvedValue({ id: 'g1', orgId: ORG, name: 'X' });
    prismaMock.group.delete.mockResolvedValue({});
    await service.deleteGroup(ORG, 'g1');
    expect(prismaMock.group.delete).toHaveBeenCalledWith({ where: { id: 'g1' } });
  });
});
