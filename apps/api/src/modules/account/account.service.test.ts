import 'reflect-metadata';
import { ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    user: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    userCredential: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
  },
}));

vi.mock('@asha/db', () => ({ prisma: prismaMock }));
vi.mock('@asha/crypto', () => ({
  hashPassword: (p: string) => Promise.resolve(`hashed(${p})`),
  verifyPassword: (p: string, hash: string) => Promise.resolve(hash === `hashed(${p})`),
}));

import { AccountService } from './account.service';

const USER = { sub: 'u1', orgId: 'org1', email: 'me@example.com', isSystemAdmin: false } as const;

function makeService() {
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const security = { emit: vi.fn().mockResolvedValue(undefined) };
  const svc = new AccountService(audit as never, security as never);
  return { svc, audit, security };
}

beforeEach(() => {
  for (const model of Object.values(prismaMock)) for (const fn of Object.values(model)) (fn as ReturnType<typeof vi.fn>).mockReset();
});

describe('AccountService.updateProfile', () => {
  it('rejects an e-mail already used by another user', async () => {
    const { svc } = makeService();
    prismaMock.user.findUnique.mockResolvedValue({ id: 'u1', email: 'me@example.com', federatedFrom: null });
    prismaMock.user.findFirst.mockResolvedValue({ id: 'other' }); // clash

    await expect(svc.updateProfile(USER, { email: 'Taken@example.com' })).rejects.toBeInstanceOf(ConflictException);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('forbids e-mail change on a federated (SSO) account', async () => {
    const { svc } = makeService();
    prismaMock.user.findUnique.mockResolvedValue({ id: 'u1', email: 'me@example.com', federatedFrom: 'okta' });

    await expect(svc.updateProfile(USER, { email: 'new@example.com' })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('updates display name + e-mail and emits a security event on e-mail change', async () => {
    const { svc, security } = makeService();
    prismaMock.user.findUnique.mockResolvedValue({ id: 'u1', email: 'me@example.com', federatedFrom: null });
    prismaMock.user.findFirst.mockResolvedValue(null); // no clash
    prismaMock.user.update.mockResolvedValue({ id: 'u1' });

    await svc.updateProfile(USER, { displayName: 'New Name', email: 'New@example.com' });
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ displayName: 'New Name', email: 'new@example.com' }) }),
    );
    expect(security.emit).toHaveBeenCalledWith(expect.objectContaining({ action: 'account.email_changed' }));
  });
});

describe('AccountService.changePassword', () => {
  it('rejects a wrong current password', async () => {
    const { svc } = makeService();
    prismaMock.userCredential.findFirst.mockResolvedValue({ id: 'c1', secret: 'hashed(right)' });

    await expect(svc.changePassword(USER, { currentPassword: 'wrong', newPassword: 'longenough' })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prismaMock.userCredential.update).not.toHaveBeenCalled();
  });

  it('hashes and stores the new password when the current one matches', async () => {
    const { svc, security } = makeService();
    prismaMock.userCredential.findFirst.mockResolvedValue({ id: 'c1', secret: 'hashed(right)' });

    await svc.changePassword(USER, { currentPassword: 'right', newPassword: 'brandnewpass' });
    expect(prismaMock.userCredential.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { secret: 'hashed(brandnewpass)' } });
    expect(security.emit).toHaveBeenCalledWith(expect.objectContaining({ action: 'account.password_changed' }));
  });

  it('lets an SSO account set an initial password without a current one', async () => {
    const { svc } = makeService();
    prismaMock.userCredential.findFirst.mockResolvedValue(null);

    await svc.changePassword(USER, { newPassword: 'firstpassword' });
    expect(prismaMock.userCredential.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: 'u1', kind: 'PASSWORD', secret: 'hashed(firstpassword)' }) }),
    );
  });
});
