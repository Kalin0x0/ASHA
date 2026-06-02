import { describe, expect, it, vi } from 'vitest';
import {
  AwsEc2Driver,
  AzureVmDriver,
  DigitalOceanDriver,
  GcpDriver,
  HarvesterDriver,
  KubeVirtDriver,
  NutanixDriver,
  OpenStackDriver,
  OracleOciDriver,
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

  it('returns DigitalOceanDriver for DIGITALOCEAN', () => {
    expect(resolveVMDriver('DIGITALOCEAN', {})?.kind).toBe('DIGITALOCEAN');
  });

  it('returns OracleOciDriver for ORACLE', () => {
    expect(resolveVMDriver('ORACLE', {})?.kind).toBe('ORACLE');
  });

  it('returns OpenStackDriver for OPENSTACK', () => {
    expect(resolveVMDriver('OPENSTACK', {})?.kind).toBe('OPENSTACK');
  });

  it('returns NutanixDriver for NUTANIX', () => {
    expect(resolveVMDriver('NUTANIX', {})?.kind).toBe('NUTANIX');
  });

  it('returns KubeVirtDriver for KUBEVIRT', () => {
    expect(resolveVMDriver('KUBEVIRT', {})?.kind).toBe('KUBEVIRT');
  });

  it('returns HarvesterDriver for HARVESTER', () => {
    expect(resolveVMDriver('HARVESTER', {})?.kind).toBe('HARVESTER');
  });

  it('accepts contract enum aliases AWS/AZURE/GCP', () => {
    expect(resolveVMDriver('AWS', {})?.kind).toBe('AWS_EC2');
    expect(resolveVMDriver('AZURE', {})?.kind).toBe('AZURE_VM');
    expect(resolveVMDriver('GCP', {})?.kind).toBe('GCP_CE');
  });

  it('returns null for unknown provider', () => {
    expect(resolveVMDriver('UNKNOWN', {})).toBeNull();
  });
});

describe('DigitalOceanDriver', () => {
  it('fails validation without required fields', () => {
    const r = new DigitalOceanDriver({ apiToken: 't' }).validateConfig();
    expect(r.ok).toBe(false);
    expect((r as { ok: false; reason: string }).reason).toContain('region');
  });

  it('creates a droplet and reports provisioning', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ droplet: { id: 12345, name: 'do-vm' } }),
      text: async () => '',
    });
    vi.stubGlobal('fetch', fetchMock);
    const d = new DigitalOceanDriver({ apiToken: 'tok', region: 'nyc3', size: 's-2vcpu-4gb', image: 'ubuntu-22-04-x64' });
    const inst = await d.createInstance({ template: '', name: 'do-vm' });
    expect(inst.id).toBe('12345');
    expect(inst.status).toBe('provisioning');
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('api.digitalocean.com/v2/droplets');
    expect((opts.headers as Record<string, string>)['Authorization']).toBe('Bearer tok');
    vi.unstubAllGlobals();
  });
});

describe('OracleOciDriver', () => {
  it('fails validation without required fields', () => {
    const r = new OracleOciDriver({ endpoint: 'iaas.example.com' }).validateConfig();
    expect(r.ok).toBe(false);
  });
});

describe('NutanixDriver', () => {
  it('fails validation without required fields', () => {
    expect(new NutanixDriver({ prismCentralUrl: 'https://pc:9440' }).validateConfig().ok).toBe(false);
  });

  it('creates a VM via Prism Central v3 with basic auth', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 202,
      json: async () => ({ metadata: { uuid: 'vm-uuid-1' } }),
      text: async () => '',
    });
    vi.stubGlobal('fetch', fetchMock);
    const d = new NutanixDriver({
      prismCentralUrl: 'https://pc:9440', username: 'admin', password: 'pw',
      clusterUuid: 'cl-1', subnetUuid: 'sub-1', imageUuid: 'img-1',
    });
    const inst = await d.createInstance({ template: '', name: 'nut-vm' });
    expect(inst.id).toBe('vm-uuid-1');
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/nutanix/v3/vms');
    expect((opts.headers as Record<string, string>)['Authorization']).toMatch(/^Basic /);
    vi.unstubAllGlobals();
  });
});

describe('KubeVirt / Harvester', () => {
  it('KubeVirt fails validation without token', () => {
    const r = new KubeVirtDriver({ apiServer: 'https://k8s:6443', namespace: 'vms', image: 'img' }).validateConfig();
    expect(r.ok).toBe(false);
    expect((r as { ok: false; reason: string }).reason).toContain('token');
  });

  it('Harvester creates a VirtualMachine CR via the k8s API', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ metadata: { name: 'hv-vm', uid: 'u1' } }),
      text: async () => '',
    });
    vi.stubGlobal('fetch', fetchMock);
    const d = new HarvesterDriver({
      apiServer: 'https://k8s:6443', token: 'tok', namespace: 'vms', image: 'quay.io/x/ubuntu:22.04',
    });
    const inst = await d.createInstance({ template: '', name: 'hv-vm' });
    expect(inst.id).toBe('hv-vm');
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/apis/kubevirt.io/v1/namespaces/vms/virtualmachines');
    expect((opts.headers as Record<string, string>)['Authorization']).toBe('Bearer tok');
    vi.unstubAllGlobals();
  });
});

describe('OpenStackDriver', () => {
  it('passes validation with required fields', () => {
    const d = new OpenStackDriver({
      authUrl: 'https://keystone:5000/v3', username: 'u', password: 'p',
      projectName: 'proj', novaUrl: 'https://nova/v2.1', flavorRef: '2', imageRef: 'img-1',
    });
    expect(d.validateConfig().ok).toBe(true);
  });

  it('authenticates via Keystone then creates a server', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        headers: { get: (h: string) => (h.toLowerCase() === 'x-subject-token' ? 'keystone-token' : null) },
        json: async () => ({}),
        text: async () => '',
      }) // keystone auth
      .mockResolvedValueOnce({
        ok: true,
        status: 202,
        json: async () => ({ server: { id: 'srv-1' } }),
        text: async () => '',
      }); // nova create
    vi.stubGlobal('fetch', fetchMock);
    const d = new OpenStackDriver({
      authUrl: 'https://keystone:5000/v3', username: 'u', password: 'p',
      projectName: 'proj', novaUrl: 'https://nova/v2.1', flavorRef: '2', imageRef: 'img-1',
    });
    const inst = await d.createInstance({ template: '', name: 'os-vm' });
    expect(inst.id).toBe('srv-1');
    const [, novaOpts] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect((novaOpts.headers as Record<string, string>)['X-Auth-Token']).toBe('keystone-token');
    vi.unstubAllGlobals();
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
