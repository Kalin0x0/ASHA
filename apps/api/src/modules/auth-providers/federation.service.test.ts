import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    user: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    ssoMapping: { findMany: vi.fn() },
    userGroup: { findMany: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
  },
}));

vi.mock('@chista/db', () => ({ prisma: prismaMock }));

import { FederationService } from './federation.service';

describe('FederationService.provision', () => {
  let svc: FederationService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new FederationService();
    prismaMock.ssoMapping.findMany.mockResolvedValue([]);
    prismaMock.userGroup.findMany.mockResolvedValue([]);
  });

  it('JIT-creates a new user on first SSO login', async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue({ id: 'u1', orgId: 'org1', email: 'a@x.io', status: 'ACTIVE' });
    const user = await svc.provision('org1', 'ac1', { email: 'A@X.io', displayName: 'A' });
    expect(prismaMock.user.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ email: 'a@x.io', orgId: 'org1' }) }),
    );
    expect(user.id).toBe('u1');
  });

  it('reuses an existing user already bound to the same provider', async () => {
    prismaMock.user.findFirst.mockResolvedValue({ id: 'u2', orgId: 'org1', email: 'b@x.io', status: 'ACTIVE', federatedFrom: 'ac1' });
    const user = await svc.provision('org1', 'ac1', { email: 'b@x.io' });
    expect(prismaMock.user.create).not.toHaveBeenCalled();
    expect(prismaMock.user.update).not.toHaveBeenCalled();
    expect(user.id).toBe('u2');
  });

  it('refuses a disabled account', async () => {
    prismaMock.user.findFirst.mockResolvedValue({ id: 'u3', orgId: 'org1', email: 'c@x.io', status: 'DISABLED' });
    await expect(svc.provision('org1', 'ac1', { email: 'c@x.io' })).rejects.toThrow(/not active/);
  });

  it('binds federatedFrom on JIT create', async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue({ id: 'u1', orgId: 'org1', email: 'a@x.io', status: 'ACTIVE', federatedFrom: 'ac1' });
    await svc.provision('org1', 'ac1', { email: 'a@x.io' });
    expect(prismaMock.user.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ federatedFrom: 'ac1' }) }),
    );
  });

  it('refuses a login when the account belongs to a different IdP (no shadowing)', async () => {
    prismaMock.user.findFirst.mockResolvedValue({ id: 'u4', orgId: 'org1', email: 'd@x.io', status: 'ACTIVE', federatedFrom: 'ac-other' });
    await expect(svc.provision('org1', 'ac1', { email: 'd@x.io' })).rejects.toThrow(/different identity provider/);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('claims an unbound (legacy/local) account on first SSO login', async () => {
    prismaMock.user.findFirst.mockResolvedValue({ id: 'u5', orgId: 'org1', email: 'e@x.io', status: 'ACTIVE', federatedFrom: null });
    prismaMock.user.update.mockResolvedValue({ id: 'u5', orgId: 'org1', email: 'e@x.io', status: 'ACTIVE', federatedFrom: 'ac1' });
    const user = await svc.provision('org1', 'ac1', { email: 'e@x.io' });
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'u5' }, data: { federatedFrom: 'ac1' } }),
    );
    expect(user.federatedFrom).toBe('ac1');
  });
});

describe('FederationService.syncGroups', () => {
  let svc: FederationService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new FederationService();
    prismaMock.userGroup.create.mockResolvedValue({});
    prismaMock.userGroup.deleteMany.mockResolvedValue({ count: 1 });
  });

  it('adds a mapped group when the assertion attribute matches', async () => {
    prismaMock.ssoMapping.findMany.mockResolvedValue([
      { groupId: 'g-admin', attribute: 'memberOf', value: 'cn=admins' },
    ]);
    prismaMock.userGroup.findMany.mockResolvedValue([]);
    await svc.syncGroups('org1', 'ac1', 'u1', { memberOf: ['cn=admins', 'cn=staff'] });
    expect(prismaMock.userGroup.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ groupId: 'g-admin', userId: 'u1' }) }),
    );
  });

  it('removes a managed membership the assertion no longer grants', async () => {
    prismaMock.ssoMapping.findMany.mockResolvedValue([
      { groupId: 'g-admin', attribute: 'memberOf', value: 'cn=admins' },
    ]);
    prismaMock.userGroup.findMany.mockResolvedValue([{ groupId: 'g-admin' }]);
    await svc.syncGroups('org1', 'ac1', 'u1', { memberOf: ['cn=other'] });
    expect(prismaMock.userGroup.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1', groupId: 'g-admin' } }),
    );
  });

  it('is a no-op when no mappings exist', async () => {
    prismaMock.ssoMapping.findMany.mockResolvedValue([]);
    await svc.syncGroups('org1', 'ac1', 'u1', { memberOf: ['x'] });
    expect(prismaMock.userGroup.findMany).not.toHaveBeenCalled();
  });
});
