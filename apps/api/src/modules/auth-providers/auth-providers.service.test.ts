import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    authConfig: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
    ssoMapping: { findMany: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
    group: { findFirst: vi.fn() },
  },
}));

vi.mock('@asha/db', () => ({ prisma: prismaMock }));
vi.mock('@asha/crypto', () => ({
  seal: (t: string) => `sealed:${t}`,
  unseal: (t: string) => t.replace(/^sealed:/, ''),
  hashToken: (t: string) => `hashed:${t}`,
  randomToken: () => 'rand',
}));

import { AuthProvidersService } from './auth-providers.service';

const audit = { record: vi.fn().mockResolvedValue(undefined) };
const env = { SECRET_SEAL_KEY: '0123456789abcdef0123456789abcdef' } as never;

describe('AuthProvidersService', () => {
  let svc: AuthProvidersService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new AuthProvidersService(audit as never, env);
  });

  it('rejects an OIDC provider missing issuer/clientId', async () => {
    await expect(
      svc.create('org1', 'u1', { type: 'OIDC', name: 'idp', enabled: true, priority: 100, config: { issuer: 'https://idp' } }),
    ).rejects.toThrow('OIDC config missing: clientId');
  });

  it('creates a valid OIDC provider and seals secrets', async () => {
    prismaMock.authConfig.create.mockResolvedValue({ id: 'a1' });
    await svc.create('org1', 'u1', {
      type: 'OIDC',
      name: 'idp',
      enabled: true,
      priority: 100,
      config: { issuer: 'https://idp', clientId: 'abc', clientSecret: 'secret123' },
    });
    const data = prismaMock.authConfig.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ orgId: 'org1', type: 'OIDC' });
    // clientSecret is a secret key → must be redacted in `config`, sealed in `secretRef`
    expect(JSON.stringify(data.config)).not.toContain('secret123');
    expect(typeof data.secretRef).toBe('string');
  });

  it('rejects a LDAP provider missing url/baseDN', async () => {
    await expect(
      svc.create('org1', 'u1', { type: 'LDAP', name: 'ad', enabled: false, priority: 100, config: {} }),
    ).rejects.toThrow('LDAP config missing');
  });

  it('refuses an SSO mapping when the group belongs to another org', async () => {
    prismaMock.authConfig.findFirst.mockResolvedValue({ id: 'a1', orgId: 'org1' });
    prismaMock.group.findFirst.mockResolvedValue(null); // group not in org1
    await expect(
      svc.createMapping('org1', 'u1', { authConfigId: 'a1', groupId: 'foreignGroup', attribute: 'memberOf', value: 'cn=admins' }),
    ).rejects.toThrow('Group not found');
    expect(prismaMock.ssoMapping.create).not.toHaveBeenCalled();
  });

  it('throws 404 fetching a provider in another org', async () => {
    prismaMock.authConfig.findFirst.mockResolvedValue(null);
    await expect(svc.get('org1', 'foreign')).rejects.toThrow('not found');
  });
});
