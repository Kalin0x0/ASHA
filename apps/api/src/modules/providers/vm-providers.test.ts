import { describe, expect, it, vi } from 'vitest';
import {
  AwsEc2Driver,
  AzureVmDriver,
  GcpDriver,
  VSphereDriver,
  resolveVMDriver,
} from './vm-provider.interface';

describe('resolveVMDriver', () => {
  it('returns ProxmoxDriver for PROXMOX', () => {
    const d = resolveVMDriver('PROXMOX', {});
    expect(d?.kind).toBe('PROXMOX');
  });

  it('returns AwsEc2Driver for AWS_EC2', () => {
    const d = resolveVMDriver('AWS_EC2', {});
    expect(d?.kind).toBe('AWS_EC2');
  });

  it('returns AzureVmDriver for AZURE_VM', () => {
    const d = resolveVMDriver('AZURE_VM', {});
    expect(d?.kind).toBe('AZURE_VM');
  });

  it('returns GcpDriver for GCP_CE', () => {
    const d = resolveVMDriver('GCP_CE', {});
    expect(d?.kind).toBe('GCP_CE');
  });

  it('returns VSphereDriver for VSPHERE', () => {
    const d = resolveVMDriver('VSPHERE', {});
    expect(d?.kind).toBe('VSPHERE');
  });

  it('returns null for unknown provider', () => {
    expect(resolveVMDriver('UNKNOWN', {})).toBeNull();
  });
});

describe('AwsEc2Driver.validateConfig', () => {
  it('fails when required fields are missing', () => {
    const d = new AwsEc2Driver({ accessKeyId: 'id' });
    const r = d.validateConfig();
    expect(r.ok).toBe(false);
    expect((r as { ok: false; reason: string }).reason).toContain('secretAccessKey');
  });

  it('passes when all required fields are present', () => {
    const d = new AwsEc2Driver({
      accessKeyId: 'id',
      secretAccessKey: 'secret',
      region: 'us-east-1',
      imageId: 'ami-123',
      instanceType: 't3.micro',
    });
    expect(d.validateConfig().ok).toBe(true);
  });
});

describe('AzureVmDriver.validateConfig', () => {
  it('fails when required fields are missing', () => {
    const d = new AzureVmDriver({ tenantId: 't' });
    const r = d.validateConfig();
    expect(r.ok).toBe(false);
  });

  it('passes with full config', () => {
    const d = new AzureVmDriver({
      tenantId: 't', clientId: 'c', clientSecret: 's',
      subscriptionId: 'sub', resourceGroup: 'rg',
      location: 'eastus', vmSize: 'Standard_B2s',
    });
    expect(d.validateConfig().ok).toBe(true);
  });
});

describe('GcpDriver.validateConfig', () => {
  it('fails when missing privateKeyPem', () => {
    const d = new GcpDriver({ projectId: 'p', zone: 'z', serviceAccountEmail: 'sa@p.iam.gserviceaccount.com', machineType: 'e2-medium', sourceImage: 'img' });
    const r = d.validateConfig();
    expect(r.ok).toBe(false);
    expect((r as { ok: false; reason: string }).reason).toContain('privateKeyPem');
  });
});

describe('VSphereDriver.validateConfig', () => {
  it('passes with minimal required fields', () => {
    const d = new VSphereDriver({
      vcenterUrl: 'https://vc.example.com', username: 'admin', password: 'pass', template: 'ubuntu-22',
    });
    expect(d.validateConfig().ok).toBe(true);
  });
});

describe('AwsEc2Driver SigV4', () => {
  it('calls EC2 endpoint with Authorization header on createInstance', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '<instanceId>i-abc123</instanceId>',
    });
    vi.stubGlobal('fetch', fetchMock);

    const d = new AwsEc2Driver({
      accessKeyId: 'AKID', secretAccessKey: 'secret', region: 'us-east-1',
      imageId: 'ami-123', instanceType: 't3.micro',
    });
    const inst = await d.createInstance({ template: '', name: 'test-vm' });
    expect(fetchMock).toHaveBeenCalled();
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('ec2.us-east-1.amazonaws.com');
    expect((opts.headers as Record<string, string>)['Authorization']).toContain('AWS4-HMAC-SHA256');
    expect(inst.status).toBe('provisioning');
    vi.unstubAllGlobals();
  });
});
