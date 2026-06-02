import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    vMProvider: { findMany: vi.fn(), create: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn(), findFirst: vi.fn() },
    dNSProvider: { findMany: vi.fn(), create: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn(), findFirst: vi.fn() },
  },
}));

vi.mock('@chista/db', () => ({ prisma: prismaMock }));

import { ProvidersService } from './providers.service';
import { ProxmoxDriver, resolveVMDriver } from './vm-provider.interface';

const audit = { record: vi.fn().mockResolvedValue(undefined) };

describe('ProvidersService — VM', () => {
  let svc: ProvidersService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new ProvidersService(audit as never);
  });

  it('rejects a Proxmox provider with incomplete config', async () => {
    await expect(
      svc.createVM('org1', 'u1', { name: 'pmx', provider: 'PROXMOX', config: { apiUrl: 'https://pmx' }, enabled: true }),
    ).rejects.toThrow('Proxmox config missing');
    expect(prismaMock.vMProvider.create).not.toHaveBeenCalled();
  });

  it('creates a fully-configured Proxmox provider', async () => {
    prismaMock.vMProvider.create.mockResolvedValue({ id: 'vp1' });
    await svc.createVM('org1', 'u1', {
      name: 'pmx',
      provider: 'PROXMOX',
      config: { apiUrl: 'https://pmx', node: 'pve', tokenId: 't', tokenSecret: 's' },
      enabled: true,
    });
    expect(prismaMock.vMProvider.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ orgId: 'org1', provider: 'PROXMOX' }) }),
    );
  });

  it('accepts a provider with no concrete driver yet (e.g. AWS)', async () => {
    prismaMock.vMProvider.create.mockResolvedValue({ id: 'vp2' });
    await svc.createVM('org1', 'u1', { name: 'aws', provider: 'AWS', config: {}, enabled: true });
    expect(prismaMock.vMProvider.create).toHaveBeenCalled();
  });

  it('throws 404 deleting a VM provider in another org', async () => {
    prismaMock.vMProvider.deleteMany.mockResolvedValue({ count: 0 });
    await expect(svc.removeVM('org1', 'u1', 'foreign')).rejects.toThrow('not found');
  });
});

describe('resolveVMDriver', () => {
  it('returns a ProxmoxDriver for PROXMOX', () => {
    const driver = resolveVMDriver('PROXMOX', {});
    expect(driver).toBeInstanceOf(ProxmoxDriver);
  });

  it('returns null for an unimplemented provider', () => {
    expect(resolveVMDriver('VSPHERE', {})).toBeNull();
  });

  it('ProxmoxDriver.validateConfig flags missing keys', () => {
    const driver = new ProxmoxDriver({ apiUrl: 'x' });
    const res = driver.validateConfig();
    expect(res.ok).toBe(false);
  });
});
