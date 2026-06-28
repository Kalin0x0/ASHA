import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    vMProvider: { findMany: vi.fn(), create: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn(), findFirst: vi.fn() },
    dNSProvider: { findMany: vi.fn(), create: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn(), findFirst: vi.fn() },
  },
}));

vi.mock('@asha/db', () => ({ prisma: prismaMock }));

import { ProvidersService } from './providers.service';
import { ProxmoxDriver, resolveVMDriver } from './vm-provider.interface';

const audit = { record: vi.fn().mockResolvedValue(undefined) };
const env = { SECRET_SEAL_KEY: '0123456789abcdef0123456789abcdef' } as never;

describe('ProvidersService — VM', () => {
  let svc: ProvidersService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new ProvidersService(audit as never, env);
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

  it('persists a fully-configured provider that passes driver validation (NUTANIX)', async () => {
    prismaMock.vMProvider.create.mockResolvedValue({ id: 'vp2' });
    await svc.createVM('org1', 'u1', {
      name: 'nut',
      provider: 'NUTANIX',
      config: {
        prismCentralUrl: 'https://pc:9440',
        username: 'admin',
        password: 'pw',
        clusterUuid: 'cl-1',
        subnetUuid: 'sub-1',
        imageUuid: 'img-1',
      },
      enabled: true,
    });
    expect(prismaMock.vMProvider.create).toHaveBeenCalled();
  });

  it('validates config up-front for a provider with a concrete driver (AWS)', async () => {
    prismaMock.vMProvider.create.mockResolvedValue({ id: 'vp3' });
    await expect(
      svc.createVM('org1', 'u1', { name: 'aws', provider: 'AWS', config: {}, enabled: true }),
    ).rejects.toThrow(/AWS config missing/);
  });

  it('seals secrets into secretRef and redacts the stored config', async () => {
    prismaMock.vMProvider.create.mockResolvedValue({ id: 'vp4' });
    await svc.createVM('org1', 'u1', {
      name: 'pmx',
      provider: 'PROXMOX',
      config: { apiUrl: 'https://pmx', node: 'pve', tokenId: 't', tokenSecret: 'super-secret' },
      enabled: true,
    });
    const data = prismaMock.vMProvider.create.mock.calls[0][0].data;
    // The plaintext secret is never stored in `config`…
    expect(JSON.stringify(data.config)).not.toContain('super-secret');
    expect((data.config as Record<string, unknown>).tokenSecret).toBe('••••••••');
    // …but `apiUrl` (non-secret) survives, and secretRef is a sealed blob.
    expect((data.config as Record<string, unknown>).apiUrl).toBe('https://pmx');
    expect(typeof data.secretRef).toBe('string');
    expect(data.secretRef).not.toContain('super-secret');
  });

  it('resolveVMConfig unseals the original secret for driver use', async () => {
    prismaMock.vMProvider.create.mockResolvedValue({ id: 'vp5' });
    await svc.createVM('org1', 'u1', {
      name: 'pmx2',
      provider: 'PROXMOX',
      config: { apiUrl: 'https://pmx', node: 'pve', tokenId: 't', tokenSecret: 'unseal-me' },
      enabled: true,
    });
    const sealed = prismaMock.vMProvider.create.mock.calls[0][0].data.secretRef;
    prismaMock.vMProvider.findFirst.mockResolvedValue({ id: 'vp5', secretRef: sealed, config: {} });
    const resolved = await svc.resolveVMConfig('org1', 'vp5');
    expect(resolved?.tokenSecret).toBe('unseal-me');
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

  it('returns null for a completely unknown provider', () => {
    expect(resolveVMDriver('UNKNOWN_XYZ', {})).toBeNull();
  });

  it('ProxmoxDriver.validateConfig flags missing keys', () => {
    const driver = new ProxmoxDriver({ apiUrl: 'x' });
    const res = driver.validateConfig();
    expect(res.ok).toBe(false);
  });
});

describe('ProxmoxDriver — API call sequence', () => {
  const CONFIG = {
    apiUrl: 'https://pve.example.com:8006',
    node: 'pve',
    tokenId: 'root@pam!asha',
    tokenSecret: 'secret',
    template: 9000,
  };

  // A driver subclass that records request() calls instead of hitting the network.
  class FakeProxmox extends ProxmoxDriver {
    calls: Array<{ method: string; path: string; body?: unknown }> = [];
    responses: Record<string, unknown> = {};
    protected override async request<T>(
      method: string,
      path: string,
      body?: Record<string, string | number>,
    ): Promise<T> {
      this.calls.push({ method, path, body });
      return (this.responses[path] ?? undefined) as T;
    }
  }

  it('clones nextid → applies resources → starts on createInstance', async () => {
    const d = new FakeProxmox(CONFIG);
    d.responses['/cluster/nextid'] = 131;

    const inst = await d.createInstance({ template: '9000', name: 'sess-vm', resources: { cores: 4, memoryMb: 8192 } });

    expect(d.calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'GET /cluster/nextid',
      'POST /nodes/pve/qemu/9000/clone',
      'POST /nodes/pve/qemu/131/config',
      'POST /nodes/pve/qemu/131/status/start',
    ]);
    expect(d.calls[1].body).toMatchObject({ newid: 131, name: 'sess-vm' });
    expect(d.calls[2].body).toMatchObject({ cores: 4, memory: 8192 });
    expect(inst).toEqual({ id: '131', name: 'sess-vm', status: 'provisioning' });
  });

  it('skips the config step when no resource overrides are given', async () => {
    const d = new FakeProxmox(CONFIG);
    d.responses['/cluster/nextid'] = 140;
    await d.createInstance({ template: '9000', name: 'plain' });
    expect(d.calls.some((c) => c.path.endsWith('/config'))).toBe(false);
  });

  it('stops then deletes on destroyInstance', async () => {
    const d = new FakeProxmox(CONFIG);
    await d.destroyInstance('131');
    expect(d.calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'POST /nodes/pve/qemu/131/status/stop',
      'DELETE /nodes/pve/qemu/131',
    ]);
  });

  it('maps Proxmox status to the VMInstance status on getInstance', async () => {
    const d = new FakeProxmox(CONFIG);
    d.responses['/nodes/pve/qemu/131/status/current'] = { status: 'running', name: 'sess-vm' };
    expect(await d.getInstance('131')).toEqual({ id: '131', name: 'sess-vm', status: 'running' });
  });
});
