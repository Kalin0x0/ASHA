import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const { db, otp, password } = vi.hoisted(() => ({
  db: {
    org: { findUnique: vi.fn() },
    user: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    twoFactorMethod: { create: vi.fn(), findFirst: vi.fn(), deleteMany: vi.fn(), updateMany: vi.fn() },
    refreshToken: { create: vi.fn() },
  }, otp: vi.fn(), password: vi.fn(),
}));
vi.mock('@asha/db', () => ({ prisma: db }));
vi.mock('@asha/crypto', async (original) => ({ ...await original<object>(), verifyPassword: password }));
vi.mock('otplib', () => ({ verify: otp, generateSecret: () => 'BASE32SECRET', generateURI: () => 'otpauth://test' }));
vi.mock('qrcode', () => ({ default: { toDataURL: async () => 'data:image/png;base64,test' } }));
import { unseal } from '@asha/crypto';
import { AuthService } from './auth.service';

const audit = { record: vi.fn() };
const env = { SECRET_SEAL_KEY: 'test-key', JWT_ACCESS_SECRET: 'access', JWT_REFRESH_SECRET: 'refresh', JWT_ACCESS_TTL: 900, JWT_REFRESH_TTL: 3600 };
const jwt = { signAsync: vi.fn().mockResolvedValue('token') };
const user = { id: 'u', orgId: 'o', email: 'a@b.test', username: 'a', status: 'ACTIVE', credentials: [{ kind: 'PASSWORD', secret: 'hash' }], twoFactorMethods: [] };
const svc = () => new AuthService(jwt as never, {} as never, audit as never, env as never);

describe('identity and TOTP hardening', () => {
  beforeEach(() => { vi.clearAllMocks(); password.mockResolvedValue(true); });
  it('rejects ambiguous cross-tenant identities before checking a password', async () => {
    db.user.findMany.mockResolvedValue([user, { ...user, orgId: 'other' }]);
    await expect(svc().login({ email: user.email, password: 'pw' })).rejects.toThrow('Invalid credentials');
    expect(password).not.toHaveBeenCalled();
  });
  it('rejects unknown or disabled organizations without falling back globally', async () => {
    db.org.findUnique.mockResolvedValue(null);
    await expect(svc().login({ email: user.email, password: 'pw', orgSlug: 'missing' })).rejects.toThrow('Invalid credentials');
    expect(db.user.findMany).not.toHaveBeenCalled();
  });
  it('scopes a password login to the selected organization', async () => {
    db.org.findUnique.mockResolvedValue({ id: 'o', status: 'ACTIVE' });
    db.user.findMany.mockResolvedValue([user]);
    await svc().login({ email: user.email, password: 'pw', orgSlug: 'customer' });
    expect(db.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ orgId: 'o' }), take: 2 }));
  });
  it('lets only one of two parallel logins spend the same TOTP window', async () => {
    // Both requests read the row before either wrote to it, so both see an unused
    // window and both verify the same six digits — the read cannot separate them.
    const totpUser = { ...user, twoFactorMethods: [{ id: 'm', type: 'TOTP', confirmed: true, secret: 'BASE32SECRET', lastUsedAt: null }] };
    db.user.findMany.mockResolvedValue([totpUser]);
    db.user.update.mockResolvedValue(totpUser);
    otp.mockReturnValue({ valid: true });
    // The conditional UPDATE is what separates them: the first moves the row into
    // this window, the second matches nothing.
    db.twoFactorMethod.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });

    await expect(svc().login({ email: user.email, password: 'pw', totp: '123456' })).resolves.toBeDefined();
    await expect(svc().login({ email: user.email, password: 'pw', totp: '123456' })).rejects.toThrow('already used');

    expect(db.twoFactorMethod.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 'm' }) }),
    );
  });

  it('does not spend the TOTP window on a wrong code', async () => {
    const totpUser = { ...user, twoFactorMethods: [{ id: 'm', type: 'TOTP', confirmed: true, secret: 'BASE32SECRET', lastUsedAt: null }] };
    db.user.findMany.mockResolvedValue([totpUser]);
    otp.mockReturnValue({ valid: false });
    await expect(svc().login({ email: user.email, password: 'pw', totp: '000000' })).rejects.toThrow('Invalid two-factor code');
    // Otherwise anyone could burn a victim's window by guessing at it.
    expect(db.twoFactorMethod.updateMany).not.toHaveBeenCalled();
  });

  it('seals newly enrolled TOTP secrets at rest', async () => {
    db.user.findUnique.mockResolvedValue(user);
    db.twoFactorMethod.create.mockResolvedValue({ id: 'm' });
    await svc().enrollTotp('u');
    const stored = db.twoFactorMethod.create.mock.calls[0]![0].data.secret;
    expect(stored).toMatch(/^sealed:v1:/);
    expect(unseal(stored.slice(10), env.SECRET_SEAL_KEY)).toBe('BASE32SECRET');
  });
  it('requires a valid existing factor before disabling TOTP', async () => {
    db.twoFactorMethod.findFirst.mockResolvedValue({ secret: 'LEGACY', confirmed: true });
    otp.mockResolvedValue({ valid: false });
    await expect(svc().disableTotp('u', '000000')).rejects.toThrow('Invalid two-factor');
    expect(db.twoFactorMethod.deleteMany).not.toHaveBeenCalled();
    otp.mockResolvedValue({ valid: true });
    await svc().disableTotp('u', '123456');
    expect(db.twoFactorMethod.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u', type: 'TOTP' } });
  });
  it('does not reinterpret corrupted encrypted secrets as plaintext', async () => {
    db.twoFactorMethod.findFirst.mockResolvedValue({ secret: 'sealed:v1:corrupt' });
    await expect(svc().disableTotp('u', '123456')).rejects.toThrow();
    expect(otp).not.toHaveBeenCalled();
    expect(db.twoFactorMethod.deleteMany).not.toHaveBeenCalled();
  });
});
