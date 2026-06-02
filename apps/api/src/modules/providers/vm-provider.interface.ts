/**
 * VM provider abstraction. Autoscale drives these to clone/boot/destroy VMs
 * that back a server pool. Only the shape is defined here; concrete drivers
 * (Proxmox first) implement it. Drivers are intentionally side-effect free at
 * construction so they can be unit-tested without live infra.
 */
export interface VMInstanceSpec {
  /** Template / image to clone from. */
  template: string;
  /** Human-readable name for the new VM. */
  name: string;
  /** Optional per-instance overrides (cores, memoryMb, …). */
  resources?: Record<string, number>;
}

export interface VMInstance {
  id: string;
  name: string;
  status: 'provisioning' | 'running' | 'stopped' | 'error';
  address?: string;
}

export interface VMProviderDriver {
  readonly kind: string;
  /** Validate that the stored config is sufficient to talk to the provider. */
  validateConfig(): { ok: true } | { ok: false; reason: string };
  createInstance(spec: VMInstanceSpec): Promise<VMInstance>;
  destroyInstance(id: string): Promise<void>;
  getInstance(id: string): Promise<VMInstance | null>;
}

interface ProxmoxConfig {
  apiUrl: string; // e.g. https://pve.example.com:8006
  node: string; // e.g. pve
  tokenId: string; // e.g. root@pam!chista
  tokenSecret: string;
  template?: string | number; // default template VMID to clone
  /** Proxmox storage for full clones (optional). */
  storage?: string;
  /** Allow self-signed Proxmox certs (lab deployments). Default false. */
  insecureTls?: boolean;
}

/**
 * Proxmox VE driver. Real calls go through the Proxmox REST API
 * (`/api2/json/...`) using an API token. Config validation is performed up-front
 * so a misconfigured provider is caught before any network call.
 *
 * Clone is asynchronous on Proxmox (returns a task UPID); we kick off the clone
 * + start and report `provisioning`, then `getInstance` reflects live status.
 */
export class ProxmoxDriver implements VMProviderDriver {
  readonly kind = 'PROXMOX';

  constructor(private readonly config: Record<string, unknown>) {}

  private cfg(): ProxmoxConfig {
    return this.config as unknown as ProxmoxConfig;
  }

  validateConfig(): { ok: true } | { ok: false; reason: string } {
    const required = ['apiUrl', 'node', 'tokenId', 'tokenSecret'];
    const missing = required.filter((k) => !this.config[k]);
    if (missing.length) return { ok: false, reason: `Proxmox config missing: ${missing.join(', ')}` };
    return { ok: true };
  }

  /** Authenticated Proxmox API request. Returns the parsed `data` payload. */
  protected async request<T = unknown>(
    method: string,
    path: string,
    body?: Record<string, string | number>,
  ): Promise<T> {
    const c = this.cfg();
    const url = `${c.apiUrl.replace(/\/$/, '')}/api2/json${path}`;
    const headers: Record<string, string> = {
      Authorization: `PVEAPIToken=${c.tokenId}=${c.tokenSecret}`,
    };
    let payload: string | undefined;
    if (body) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      payload = new URLSearchParams(
        Object.entries(body).reduce<Record<string, string>>((acc, [k, v]) => {
          acc[k] = String(v);
          return acc;
        }, {}),
      ).toString();
    }

    // Self-signed Proxmox certs are common in labs; opt-in via insecureTls.
    const dispatcher = c.insecureTls ? insecureDispatcher() : undefined;
    const res = await fetch(url, {
      method,
      headers,
      body: payload,
      ...(dispatcher ? { dispatcher } : {}),
    } as RequestInit);

    if (!res.ok) {
      throw new Error(`Proxmox ${method} ${path} → ${res.status} ${await res.text()}`);
    }
    const json = (await res.json()) as { data: T };
    return json.data;
  }

  async createInstance(spec: VMInstanceSpec): Promise<VMInstance> {
    const c = this.cfg();
    const template = spec.template || c.template;
    if (!template) throw new Error('Proxmox createInstance: no template VMID provided');

    // 1. Reserve a fresh VMID from the cluster.
    const newid = await this.request<number>('GET', '/cluster/nextid');

    // 2. Clone the template into the new VMID.
    await this.request('POST', `/nodes/${c.node}/qemu/${template}/clone`, {
      newid,
      name: spec.name,
      ...(c.storage ? { storage: c.storage, full: 1 } : {}),
    });

    // 3. Apply optional resource overrides (cores, memory).
    const cfgUpdate: Record<string, string | number> = {};
    if (spec.resources?.cores) cfgUpdate.cores = spec.resources.cores;
    if (spec.resources?.memoryMb) cfgUpdate.memory = spec.resources.memoryMb;
    if (Object.keys(cfgUpdate).length) {
      await this.request('POST', `/nodes/${c.node}/qemu/${newid}/config`, cfgUpdate);
    }

    // 4. Boot it.
    await this.request('POST', `/nodes/${c.node}/qemu/${newid}/status/start`);

    return { id: String(newid), name: spec.name, status: 'provisioning' };
  }

  async destroyInstance(id: string): Promise<void> {
    const c = this.cfg();
    // Stop (ignore "already stopped"), then delete the VM.
    await this.request('POST', `/nodes/${c.node}/qemu/${id}/status/stop`).catch(() => undefined);
    await this.request('DELETE', `/nodes/${c.node}/qemu/${id}`);
  }

  async getInstance(id: string): Promise<VMInstance | null> {
    const c = this.cfg();
    try {
      const data = await this.request<{ status: string; name?: string }>(
        'GET',
        `/nodes/${c.node}/qemu/${id}/status/current`,
      );
      const status: VMInstance['status'] =
        data.status === 'running' ? 'running' : data.status === 'stopped' ? 'stopped' : 'provisioning';
      return { id, name: data.name ?? id, status };
    } catch {
      return null;
    }
  }
}

/**
 * Build an undici dispatcher that skips TLS verification, for self-signed
 * Proxmox endpoints. Imported lazily so environments that never enable
 * insecureTls don't pay for it and tests don't need undici.
 */
function insecureDispatcher(): unknown {
  // undici ships with Node; require it dynamically so the type system and
  // bundlers don't need a module declaration and unused paths pay nothing.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const undici = require('undici') as { Agent: new (opts: unknown) => unknown };
  return new undici.Agent({ connect: { rejectUnauthorized: false } });
}

// ─────────────────────────────────────────────────────────────────────────────
// AWS EC2 driver
// ─────────────────────────────────────────────────────────────────────────────

import { createHash, createHmac } from 'crypto';

interface AwsConfig {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  /** AMI ID to launch. */
  imageId: string;
  instanceType: string;
  /** Optional: security group IDs. */
  securityGroupIds?: string[];
  /** Optional: subnet ID. */
  subnetId?: string;
  /** Optional: key pair name for SSH. */
  keyName?: string;
}

/**
 * AWS EC2 driver. Uses the Query API (application/x-www-form-urlencoded) with
 * SigV4 signing — no AWS SDK required.
 */
export class AwsEc2Driver implements VMProviderDriver {
  readonly kind = 'AWS_EC2';

  constructor(private readonly config: Record<string, unknown>) {}

  private cfg(): AwsConfig {
    return this.config as unknown as AwsConfig;
  }

  validateConfig(): { ok: true } | { ok: false; reason: string } {
    const required = ['accessKeyId', 'secretAccessKey', 'region', 'imageId', 'instanceType'];
    const missing = required.filter((k) => !this.config[k]);
    if (missing.length) return { ok: false, reason: `AWS config missing: ${missing.join(', ')}` };
    return { ok: true };
  }

  private sign(
    method: string,
    service: string,
    region: string,
    host: string,
    path: string,
    body: string,
    accessKeyId: string,
    secretAccessKey: string,
  ): Record<string, string> {
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z';
    const dateStamp = amzDate.slice(0, 8);

    const payloadHash = createHash('sha256').update(body).digest('hex');
    const canonicalHeaders = `content-type:application/x-www-form-urlencoded\nhost:${host}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = 'content-type;host;x-amz-date';
    const canonicalRequest = [method, path, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope,
      createHash('sha256').update(canonicalRequest).digest('hex')].join('\n');

    const hmac = (key: Buffer | string, data: string) =>
      createHmac('sha256', key).update(data).digest();
    const signingKey = hmac(
      hmac(hmac(hmac(`AWS4${secretAccessKey}`, dateStamp), region), service),
      'aws4_request',
    );
    const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');
    const authorization =
      `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return {
      Authorization: authorization,
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Amz-Date': amzDate,
    };
  }

  private async ec2Query<T = unknown>(params: Record<string, string>): Promise<T> {
    const c = this.cfg();
    const host = `ec2.${c.region}.amazonaws.com`;
    const body = new URLSearchParams({ ...params, Version: '2016-11-15' }).toString();
    const headers = this.sign('POST', 'ec2', c.region, host, '/', body, c.accessKeyId, c.secretAccessKey);
    const res = await fetch(`https://${host}/`, { method: 'POST', headers, body });
    const text = await res.text();
    if (!res.ok) throw new Error(`AWS EC2 error: ${res.status} ${text}`);
    // Minimal XML extraction for the fields we need (avoids xml parser dep).
    return parseSimpleXml(text) as T;
  }

  async createInstance(spec: VMInstanceSpec): Promise<VMInstance> {
    const c = this.cfg();
    const params: Record<string, string> = {
      Action: 'RunInstances',
      ImageId: spec.template || c.imageId,
      InstanceType: c.instanceType,
      MinCount: '1',
      MaxCount: '1',
      'TagSpecification.1.ResourceType': 'instance',
      'TagSpecification.1.Tag.1.Key': 'Name',
      'TagSpecification.1.Tag.1.Value': spec.name,
    };
    if (c.keyName) params['KeyName'] = c.keyName;
    if (c.subnetId) params['SubnetId'] = c.subnetId;
    if (c.securityGroupIds) {
      c.securityGroupIds.forEach((sg, i) => { params[`SecurityGroupId.${i + 1}`] = sg; });
    }
    if (spec.resources?.cores) params['CpuOptions.CoreCount'] = String(spec.resources.cores);

    const result = xmlValue(await this.ec2Query<string>(params), 'instanceId') ?? 'unknown';
    return { id: result, name: spec.name, status: 'provisioning' };
  }

  async destroyInstance(id: string): Promise<void> {
    await this.ec2Query({ Action: 'TerminateInstances', 'InstanceId.1': id });
  }

  async getInstance(id: string): Promise<VMInstance | null> {
    try {
      const res = await this.ec2Query<string>({
        Action: 'DescribeInstances',
        'InstanceId.1': id,
      });
      // Scope extraction to the <instanceState> block — a bare xmlValue(res,'name')
      // greedily matches the first <name> anywhere in the reservation/tag XML and
      // can pick up an unrelated value, misreporting status.
      const stateBlock = typeof res === 'string' ? /<instanceState>([\s\S]*?)<\/instanceState>/.exec(res)?.[1] : undefined;
      const state = xmlValue(stateBlock ?? '', 'name') ?? 'unknown';
      const status: VMInstance['status'] =
        state === 'running' ? 'running' : state === 'stopped' ? 'stopped' : 'provisioning';
      return { id, name: id, status };
    } catch {
      return null;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Azure VM driver
// ─────────────────────────────────────────────────────────────────────────────

interface AzureConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  subscriptionId: string;
  resourceGroup: string;
  location: string;
  /** VM size, e.g. Standard_B2s */
  vmSize: string;
  /** Reference: publisher/offer/sku */
  imagePublisher?: string;
  imageOffer?: string;
  imageSku?: string;
}

export class AzureVmDriver implements VMProviderDriver {
  readonly kind = 'AZURE_VM';
  private tokenCache: { token: string; expiresAt: number } | null = null;

  constructor(private readonly config: Record<string, unknown>) {}

  private cfg(): AzureConfig {
    return this.config as unknown as AzureConfig;
  }

  validateConfig(): { ok: true } | { ok: false; reason: string } {
    const required = ['tenantId', 'clientId', 'clientSecret', 'subscriptionId', 'resourceGroup', 'location', 'vmSize'];
    const missing = required.filter((k) => !this.config[k]);
    if (missing.length) return { ok: false, reason: `Azure config missing: ${missing.join(', ')}` };
    return { ok: true };
  }

  private async getToken(): Promise<string> {
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now() + 60_000) {
      return this.tokenCache.token;
    }
    const c = this.cfg();
    const res = await fetch(
      `https://login.microsoftonline.com/${c.tenantId}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: c.clientId,
          client_secret: c.clientSecret,
          scope: 'https://management.azure.com/.default',
        }).toString(),
      },
    );
    if (!res.ok) throw new Error(`Azure token error: ${await res.text()}`);
    const data = (await res.json()) as { access_token: string; expires_in: number };
    this.tokenCache = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
    return data.access_token;
  }

  private async arm<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
    const token = await this.getToken();
    const url = `https://management.azure.com${path}?api-version=2023-09-01`;
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`Azure ARM ${method} ${path}: ${await res.text()}`);
    if (res.status === 204) return {} as T;
    return res.json() as Promise<T>;
  }

  async createInstance(spec: VMInstanceSpec): Promise<VMInstance> {
    const c = this.cfg();
    const base = `/subscriptions/${c.subscriptionId}/resourceGroups/${c.resourceGroup}`;
    const vmBody = {
      location: c.location,
      properties: {
        hardwareProfile: { vmSize: c.vmSize },
        storageProfile: {
          imageReference: {
            publisher: c.imagePublisher ?? 'Canonical',
            offer: c.imageOffer ?? 'UbuntuServer',
            sku: c.imageSku ?? '22_04-lts',
            version: 'latest',
          },
          osDisk: { createOption: 'FromImage', deleteOption: 'Delete' },
        },
        osProfile: {
          computerName: spec.name.slice(0, 15),
          adminUsername: 'chista',
          linuxConfiguration: { disablePasswordAuthentication: true },
        },
        networkProfile: { networkInterfaces: [] },
      },
    };
    const vm = await this.arm<{ name: string }>('PUT', `${base}/virtualMachines/${spec.name}`, vmBody);
    return { id: `${base}/virtualMachines/${vm.name ?? spec.name}`, name: spec.name, status: 'provisioning' };
  }

  async destroyInstance(id: string): Promise<void> {
    await this.arm('DELETE', id).catch(() => undefined);
  }

  async getInstance(id: string): Promise<VMInstance | null> {
    try {
      const vm = await this.arm<{
        name?: string;
        properties?: {
          provisioningState?: string;
          instanceView?: { statuses?: Array<{ code?: string }> };
        };
      }>('GET', `${id}?$expand=instanceView`);

      // The real run state lives in instanceView PowerState/* — provisioningState
      // stays "Succeeded" even for a stopped/deallocated VM, so reading it alone
      // reports dead VMs as running (autoscale would never replace them).
      const power = (vm.properties?.instanceView?.statuses ?? [])
        .map((s) => s.code ?? '')
        .find((c) => c.startsWith('PowerState/'));
      const provisioning = (vm.properties?.provisioningState ?? '').toLowerCase();

      let status: VMInstance['status'];
      if (power) {
        status = power === 'PowerState/running' ? 'running' : 'stopped';
      } else if (provisioning === 'deleting' || provisioning === 'failed') {
        status = 'stopped';
      } else if (provisioning === 'succeeded') {
        status = 'running';
      } else {
        status = 'provisioning';
      }
      return { id, name: vm.name ?? id, status };
    } catch {
      return null;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GCP Compute Engine driver
// ─────────────────────────────────────────────────────────────────────────────

interface GcpConfig {
  projectId: string;
  zone: string;
  /** Service account email. */
  serviceAccountEmail: string;
  /** PEM-encoded private key (RSA). */
  privateKeyPem: string;
  machineType: string;
  /** Source image, e.g. projects/debian-cloud/global/images/family/debian-12 */
  sourceImage: string;
}

export class GcpDriver implements VMProviderDriver {
  readonly kind = 'GCP_CE';
  private tokenCache: { token: string; expiresAt: number } | null = null;

  constructor(private readonly config: Record<string, unknown>) {}

  private cfg(): GcpConfig {
    return this.config as unknown as GcpConfig;
  }

  validateConfig(): { ok: true } | { ok: false; reason: string } {
    const required = ['projectId', 'zone', 'serviceAccountEmail', 'privateKeyPem', 'machineType', 'sourceImage'];
    const missing = required.filter((k) => !this.config[k]);
    if (missing.length) return { ok: false, reason: `GCP config missing: ${missing.join(', ')}` };
    return { ok: true };
  }

  private async getToken(): Promise<string> {
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now() + 60_000) return this.tokenCache.token;
    const c = this.cfg();
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
      iss: c.serviceAccountEmail,
      scope: 'https://www.googleapis.com/auth/compute',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })).toString('base64url');
    const { createSign } = await import('crypto');
    const sign = createSign('RSA-SHA256');
    sign.update(`${header}.${payload}`);
    const sig = sign.sign(c.privateKeyPem, 'base64url');
    const jwt = `${header}.${payload}.${sig}`;
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth2:grant-type:jwt-bearer', assertion: jwt }).toString(),
    });
    if (!res.ok) throw new Error(`GCP token error: ${await res.text()}`);
    const data = (await res.json()) as { access_token: string; expires_in: number };
    this.tokenCache = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
    return data.access_token;
  }

  private async gce<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
    const token = await this.getToken();
    const c = this.cfg();
    const base = `https://compute.googleapis.com/compute/v1/projects/${c.projectId}/zones/${c.zone}`;
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`GCP ${method} ${path}: ${await res.text()}`);
    if (res.status === 204) return {} as T;
    return res.json() as Promise<T>;
  }

  async createInstance(spec: VMInstanceSpec): Promise<VMInstance> {
    const c = this.cfg();
    const body = {
      name: spec.name,
      machineType: `zones/${c.zone}/machineTypes/${c.machineType}`,
      disks: [{ boot: true, autoDelete: true, initializeParams: { sourceImage: c.sourceImage } }],
      networkInterfaces: [{ accessConfigs: [{ type: 'ONE_TO_ONE_NAT' }] }],
    };
    // The POST returns a zonal Operation, not the instance — its `name` is the
    // operation id, NOT an IP, so don't surface it as `address`. getInstance
    // populates the real NAT IP once the VM is up.
    await this.gce<{ name: string }>('POST', '/instances', body);
    return { id: `${spec.name}`, name: spec.name, status: 'provisioning' };
  }

  async destroyInstance(id: string): Promise<void> {
    await this.gce('DELETE', `/instances/${id}`).catch(() => undefined);
  }

  async getInstance(id: string): Promise<VMInstance | null> {
    try {
      const inst = await this.gce<{ name: string; status: string; networkInterfaces?: Array<{ accessConfigs?: Array<{ natIP?: string }> }> }>(
        'GET', `/instances/${id}`,
      );
      const status: VMInstance['status'] =
        inst.status === 'RUNNING' ? 'running' : inst.status === 'TERMINATED' ? 'stopped' : 'provisioning';
      const address = inst.networkInterfaces?.[0]?.accessConfigs?.[0]?.natIP;
      return { id, name: inst.name, status, address };
    } catch {
      return null;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// VMware vSphere driver
// ─────────────────────────────────────────────────────────────────────────────

interface VSphereConfig {
  vcenterUrl: string;  // e.g. https://vcenter.example.com
  username: string;
  password: string;
  datacenter?: string;
  cluster?: string;
  datastore?: string;
  /** Name of the template/snapshot to clone from. */
  template: string;
  /** VM folder path. */
  folder?: string;
  /** Allow self-signed certs. */
  insecureTls?: boolean;
}

export class VSphereDriver implements VMProviderDriver {
  readonly kind = 'VSPHERE';
  private sessionId: string | null = null;
  private sessionExpiresAt = 0;

  constructor(private readonly config: Record<string, unknown>) {}

  private cfg(): VSphereConfig {
    return this.config as unknown as VSphereConfig;
  }

  validateConfig(): { ok: true } | { ok: false; reason: string } {
    const required = ['vcenterUrl', 'username', 'password', 'template'];
    const missing = required.filter((k) => !this.config[k]);
    if (missing.length) return { ok: false, reason: `vSphere config missing: ${missing.join(', ')}` };
    return { ok: true };
  }

  private async getSession(): Promise<string> {
    if (this.sessionId && this.sessionExpiresAt > Date.now() + 60_000) return this.sessionId;
    const c = this.cfg();
    const base64 = Buffer.from(`${c.username}:${c.password}`).toString('base64');
    const res = await fetch(`${c.vcenterUrl}/api/session`, {
      method: 'POST',
      headers: { Authorization: `Basic ${base64}` },
    });
    if (!res.ok) throw new Error(`vSphere session error: ${res.status}`);
    const id = (await res.json()) as string;
    this.sessionId = id;
    this.sessionExpiresAt = Date.now() + 20 * 60_000;
    return id;
  }

  private async vsphere<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
    const sid = await this.getSession();
    const c = this.cfg();
    const res = await fetch(`${c.vcenterUrl}/api${path}`, {
      method,
      headers: { 'vmware-api-session-id': sid, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`vSphere ${method} ${path}: ${res.status} ${await res.text()}`);
    if (res.status === 204) return {} as T;
    return res.json() as Promise<T>;
  }

  async createInstance(spec: VMInstanceSpec): Promise<VMInstance> {
    const c = this.cfg();
    const params = new URLSearchParams({ action: 'instant-clone' });
    const body = {
      name: spec.name,
      source_vm: spec.template || c.template,
    };
    const id = await this.vsphere<string>('POST', `/vcenter/vm?${params.toString()}`, body);
    return { id: String(id), name: spec.name, status: 'provisioning' };
  }

  async destroyInstance(id: string): Promise<void> {
    await this.vsphere('DELETE', `/vcenter/vm/${id}`).catch(() => undefined);
  }

  async getInstance(id: string): Promise<VMInstance | null> {
    try {
      const vm = await this.vsphere<{ name: string; power_state: string }>(
        'GET', `/vcenter/vm/${id}`,
      );
      const status: VMInstance['status'] =
        vm.power_state === 'POWERED_ON' ? 'running' : vm.power_state === 'POWERED_OFF' ? 'stopped' : 'provisioning';
      return { id, name: vm.name, status };
    } catch {
      return null;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DigitalOcean Droplets driver
// ─────────────────────────────────────────────────────────────────────────────

interface DigitalOceanConfig {
  /** Personal access token. */
  apiToken: string;
  region: string;       // e.g. nyc3
  size: string;         // e.g. s-2vcpu-4gb
  /** Image slug or ID, e.g. ubuntu-22-04-x64 */
  image: string;
  /** Optional SSH key fingerprints/IDs. */
  sshKeys?: Array<string | number>;
}

export class DigitalOceanDriver implements VMProviderDriver {
  readonly kind = 'DIGITALOCEAN';

  constructor(private readonly config: Record<string, unknown>) {}

  private cfg(): DigitalOceanConfig {
    return this.config as unknown as DigitalOceanConfig;
  }

  validateConfig(): { ok: true } | { ok: false; reason: string } {
    const required = ['apiToken', 'region', 'size', 'image'];
    const missing = required.filter((k) => !this.config[k]);
    if (missing.length) return { ok: false, reason: `DigitalOcean config missing: ${missing.join(', ')}` };
    return { ok: true };
  }

  private async api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
    const c = this.cfg();
    const res = await fetch(`https://api.digitalocean.com/v2${path}`, {
      method,
      headers: { Authorization: `Bearer ${c.apiToken}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`DigitalOcean ${method} ${path}: ${res.status} ${await res.text()}`);
    if (res.status === 204) return {} as T;
    return res.json() as Promise<T>;
  }

  async createInstance(spec: VMInstanceSpec): Promise<VMInstance> {
    const c = this.cfg();
    const body = {
      name: spec.name,
      region: c.region,
      size: c.size,
      image: spec.template || c.image,
      ...(c.sshKeys ? { ssh_keys: c.sshKeys } : {}),
    };
    const res = await this.api<{ droplet: { id: number; name: string } }>('POST', '/droplets', body);
    return { id: String(res.droplet.id), name: res.droplet.name, status: 'provisioning' };
  }

  async destroyInstance(id: string): Promise<void> {
    await this.api('DELETE', `/droplets/${id}`).catch(() => undefined);
  }

  async getInstance(id: string): Promise<VMInstance | null> {
    try {
      const res = await this.api<{
        droplet: { name: string; status: string; networks?: { v4?: Array<{ ip_address: string; type: string }> } };
      }>('GET', `/droplets/${id}`);
      const d = res.droplet;
      const status: VMInstance['status'] =
        d.status === 'active' ? 'running' : d.status === 'off' ? 'stopped' : 'provisioning';
      const address = d.networks?.v4?.find((n) => n.type === 'public')?.ip_address;
      return { id, name: d.name, status, address };
    } catch {
      return null;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Oracle Cloud Infrastructure (OCI) Compute driver
// ─────────────────────────────────────────────────────────────────────────────

interface OciConfig {
  /** API endpoint region host, e.g. iaas.us-ashburn-1.oraclecloud.com */
  endpoint: string;
  tenancyOcid: string;
  userOcid: string;
  /** Key fingerprint registered with the user. */
  fingerprint: string;
  /** PEM-encoded API signing key. */
  privateKeyPem: string;
  compartmentOcid: string;
  availabilityDomain: string;
  shape: string;          // e.g. VM.Standard.E4.Flex
  subnetOcid: string;
  imageOcid: string;
}

/**
 * OCI Compute driver. OCI uses HTTP request signing (draft-cavage) with the
 * user's API key — implemented inline with Node crypto, no OCI SDK.
 */
export class OracleOciDriver implements VMProviderDriver {
  readonly kind = 'ORACLE';

  constructor(private readonly config: Record<string, unknown>) {}

  private cfg(): OciConfig {
    return this.config as unknown as OciConfig;
  }

  validateConfig(): { ok: true } | { ok: false; reason: string } {
    const required = [
      'endpoint', 'tenancyOcid', 'userOcid', 'fingerprint', 'privateKeyPem',
      'compartmentOcid', 'availabilityDomain', 'shape', 'subnetOcid', 'imageOcid',
    ];
    const missing = required.filter((k) => !this.config[k]);
    if (missing.length) return { ok: false, reason: `OCI config missing: ${missing.join(', ')}` };
    return { ok: true };
  }

  /** Sign + send an OCI request using the draft-cavage HTTP signature scheme. */
  private async request<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
    const c = this.cfg();
    const host = c.endpoint;
    const url = `https://${host}${path}`;
    const date = new Date().toUTCString();
    const keyId = `${c.tenancyOcid}/${c.userOcid}/${c.fingerprint}`;

    const headers: Record<string, string> = { date, host };
    let signingString = `(request-target): ${method.toLowerCase()} ${path}\ndate: ${date}\nhost: ${host}`;
    let signedHeaders = '(request-target) date host';

    let payload: string | undefined;
    if (body !== undefined) {
      payload = JSON.stringify(body);
      const sha = createHash('sha256').update(payload).digest('base64');
      headers['content-type'] = 'application/json';
      headers['content-length'] = String(Buffer.byteLength(payload));
      headers['x-content-sha256'] = sha;
      signingString += `\ncontent-length: ${headers['content-length']}\ncontent-type: application/json\nx-content-sha256: ${sha}`;
      signedHeaders += ' content-length content-type x-content-sha256';
    }

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createSign } = require('crypto') as typeof import('crypto');
    const signature = createSign('RSA-SHA256').update(signingString).sign(c.privateKeyPem, 'base64');
    headers['Authorization'] =
      `Signature version="1",keyId="${keyId}",algorithm="rsa-sha256",headers="${signedHeaders}",signature="${signature}"`;

    const res = await fetch(url, { method, headers, body: payload });
    if (!res.ok) throw new Error(`OCI ${method} ${path}: ${res.status} ${await res.text()}`);
    if (res.status === 204) return {} as T;
    return res.json() as Promise<T>;
  }

  async createInstance(spec: VMInstanceSpec): Promise<VMInstance> {
    const c = this.cfg();
    const body = {
      compartmentId: c.compartmentOcid,
      availabilityDomain: c.availabilityDomain,
      shape: c.shape,
      displayName: spec.name,
      sourceDetails: { sourceType: 'image', imageId: spec.template || c.imageOcid },
      createVnicDetails: { subnetId: c.subnetOcid },
      ...(spec.resources?.cores || spec.resources?.memoryMb
        ? {
            shapeConfig: {
              ...(spec.resources?.cores ? { ocpus: spec.resources.cores } : {}),
              ...(spec.resources?.memoryMb ? { memoryInGBs: Math.round(spec.resources.memoryMb / 1024) } : {}),
            },
          }
        : {}),
    };
    const res = await this.request<{ id: string; displayName: string }>('POST', '/20160918/instances', body);
    return { id: res.id, name: res.displayName ?? spec.name, status: 'provisioning' };
  }

  async destroyInstance(id: string): Promise<void> {
    await this.request('DELETE', `/20160918/instances/${id}`).catch(() => undefined);
  }

  async getInstance(id: string): Promise<VMInstance | null> {
    try {
      const res = await this.request<{ displayName: string; lifecycleState: string }>(
        'GET', `/20160918/instances/${id}`,
      );
      const s = res.lifecycleState;
      const status: VMInstance['status'] =
        s === 'RUNNING' ? 'running' : s === 'STOPPED' || s === 'TERMINATED' ? 'stopped' : 'provisioning';
      return { id, name: res.displayName, status };
    } catch {
      return null;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// OpenStack Nova driver
// ─────────────────────────────────────────────────────────────────────────────

interface OpenStackConfig {
  /** Keystone v3 auth URL, e.g. https://keystone.example.com:5000/v3 */
  authUrl: string;
  username: string;
  password: string;
  /** Project (tenant) name + domain. */
  projectName: string;
  userDomainName?: string;
  projectDomainName?: string;
  /** Compute (Nova) service endpoint, e.g. https://nova.example.com/v2.1 */
  novaUrl: string;
  flavorRef: string;    // flavor ID
  imageRef: string;     // image ID
  networkId?: string;
}

export class OpenStackDriver implements VMProviderDriver {
  readonly kind = 'OPENSTACK';
  private tokenCache: { token: string; expiresAt: number } | null = null;

  constructor(private readonly config: Record<string, unknown>) {}

  private cfg(): OpenStackConfig {
    return this.config as unknown as OpenStackConfig;
  }

  validateConfig(): { ok: true } | { ok: false; reason: string } {
    const required = ['authUrl', 'username', 'password', 'projectName', 'novaUrl', 'flavorRef', 'imageRef'];
    const missing = required.filter((k) => !this.config[k]);
    if (missing.length) return { ok: false, reason: `OpenStack config missing: ${missing.join(', ')}` };
    return { ok: true };
  }

  /** Keystone v3 password auth → returns a scoped token (X-Subject-Token). */
  private async getToken(): Promise<string> {
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now() + 60_000) return this.tokenCache.token;
    const c = this.cfg();
    const body = {
      auth: {
        identity: {
          methods: ['password'],
          password: {
            user: {
              name: c.username,
              domain: { name: c.userDomainName ?? 'Default' },
              password: c.password,
            },
          },
        },
        scope: {
          project: { name: c.projectName, domain: { name: c.projectDomainName ?? 'Default' } },
        },
      },
    };
    const res = await fetch(`${c.authUrl.replace(/\/$/, '')}/auth/tokens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`OpenStack auth failed: ${res.status} ${await res.text()}`);
    const token = res.headers.get('x-subject-token');
    if (!token) throw new Error('OpenStack auth: no X-Subject-Token header');
    // Keystone tokens default to ~1h; cache conservatively for 30 minutes.
    this.tokenCache = { token, expiresAt: Date.now() + 30 * 60_000 };
    return token;
  }

  private async nova<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
    const token = await this.getToken();
    const c = this.cfg();
    const res = await fetch(`${c.novaUrl.replace(/\/$/, '')}${path}`, {
      method,
      headers: { 'X-Auth-Token': token, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`OpenStack Nova ${method} ${path}: ${res.status} ${await res.text()}`);
    if (res.status === 204) return {} as T;
    return res.json() as Promise<T>;
  }

  async createInstance(spec: VMInstanceSpec): Promise<VMInstance> {
    const c = this.cfg();
    const server: Record<string, unknown> = {
      name: spec.name,
      flavorRef: c.flavorRef,
      imageRef: spec.template || c.imageRef,
    };
    if (c.networkId) server.networks = [{ uuid: c.networkId }];
    const res = await this.nova<{ server: { id: string } }>('POST', '/servers', { server });
    return { id: res.server.id, name: spec.name, status: 'provisioning' };
  }

  async destroyInstance(id: string): Promise<void> {
    await this.nova('DELETE', `/servers/${id}`).catch(() => undefined);
  }

  async getInstance(id: string): Promise<VMInstance | null> {
    try {
      const res = await this.nova<{ server: { name: string; status: string } }>('GET', `/servers/${id}`);
      const s = res.server.status;
      const status: VMInstance['status'] =
        s === 'ACTIVE' ? 'running' : s === 'SHUTOFF' ? 'stopped' : s === 'ERROR' ? 'error' : 'provisioning';
      return { id, name: res.server.name, status };
    } catch {
      return null;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Nutanix AHV (Prism Central v3) driver
// ─────────────────────────────────────────────────────────────────────────────

interface NutanixConfig {
  prismCentralUrl: string; // e.g. https://pc.example.com:9440
  username: string;
  password: string;
  clusterUuid: string;
  subnetUuid: string;
  /** Source image UUID to clone the boot disk from. */
  imageUuid: string;
  insecureTls?: boolean;
}

export class NutanixDriver implements VMProviderDriver {
  readonly kind = 'NUTANIX';

  constructor(private readonly config: Record<string, unknown>) {}

  private cfg(): NutanixConfig {
    return this.config as unknown as NutanixConfig;
  }

  validateConfig(): { ok: true } | { ok: false; reason: string } {
    const required = ['prismCentralUrl', 'username', 'password', 'clusterUuid', 'subnetUuid', 'imageUuid'];
    const missing = required.filter((k) => !this.config[k]);
    if (missing.length) return { ok: false, reason: `Nutanix config missing: ${missing.join(', ')}` };
    return { ok: true };
  }

  private async v3<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
    const c = this.cfg();
    const auth = Buffer.from(`${c.username}:${c.password}`).toString('base64');
    const dispatcher = c.insecureTls ? insecureDispatcher() : undefined;
    const res = await fetch(`${c.prismCentralUrl.replace(/\/$/, '')}/api/nutanix/v3${path}`, {
      method,
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      ...(dispatcher ? { dispatcher } : {}),
    } as RequestInit);
    if (!res.ok) throw new Error(`Nutanix ${method} ${path}: ${res.status} ${await res.text()}`);
    if (res.status === 204) return {} as T;
    return res.json() as Promise<T>;
  }

  async createInstance(spec: VMInstanceSpec): Promise<VMInstance> {
    const c = this.cfg();
    const body = {
      spec: {
        name: spec.name,
        resources: {
          num_sockets: spec.resources?.cores ?? 2,
          memory_size_mib: spec.resources?.memoryMb ?? 4096,
          nic_list: [{ subnet_reference: { kind: 'subnet', uuid: c.subnetUuid } }],
          disk_list: [
            {
              data_source_reference: { kind: 'image', uuid: spec.template || c.imageUuid },
              device_properties: { device_type: 'DISK' },
            },
          ],
        },
        cluster_reference: { kind: 'cluster', uuid: c.clusterUuid },
      },
      metadata: { kind: 'vm' },
    };
    const res = await this.v3<{ metadata: { uuid: string } }>('POST', '/vms', body);
    return { id: res.metadata.uuid, name: spec.name, status: 'provisioning' };
  }

  async destroyInstance(id: string): Promise<void> {
    await this.v3('DELETE', `/vms/${id}`).catch(() => undefined);
  }

  async getInstance(id: string): Promise<VMInstance | null> {
    try {
      const vm = await this.v3<{
        status: { name: string; resources?: { power_state?: string } };
      }>('GET', `/vms/${id}`);
      const power = vm.status.resources?.power_state;
      const status: VMInstance['status'] =
        power === 'ON' ? 'running' : power === 'OFF' ? 'stopped' : 'provisioning';
      return { id, name: vm.status.name, status };
    } catch {
      return null;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// KubeVirt / Harvester driver (Kubernetes VirtualMachine CRD)
// ─────────────────────────────────────────────────────────────────────────────

interface KubeVirtConfig {
  /** Kubernetes API server URL, e.g. https://k8s.example.com:6443 */
  apiServer: string;
  /** Bearer token for a ServiceAccount with kubevirt.io permissions. */
  token: string;
  namespace: string;
  /** containerDisk image (e.g. quay.io/containerdisks/ubuntu:22.04) or a
   *  Harvester/KubeVirt DataVolume/source image name. */
  image: string;
  insecureTls?: boolean;
}

/**
 * Drives KubeVirt VirtualMachine custom resources over the Kubernetes API.
 * Harvester is KubeVirt-based, so the same driver backs both (kind reported
 * per the registered provider). No kube client dep — plain REST + bearer token.
 */
class KubeVirtBase implements VMProviderDriver {
  readonly kind: string;

  constructor(private readonly config: Record<string, unknown>, kind: string) {
    this.kind = kind;
  }

  private cfg(): KubeVirtConfig {
    return this.config as unknown as KubeVirtConfig;
  }

  validateConfig(): { ok: true } | { ok: false; reason: string } {
    const required = ['apiServer', 'token', 'namespace', 'image'];
    const missing = required.filter((k) => !this.config[k]);
    if (missing.length) return { ok: false, reason: `${this.kind} config missing: ${missing.join(', ')}` };
    return { ok: true };
  }

  private async k8s<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
    const c = this.cfg();
    const dispatcher = c.insecureTls ? insecureDispatcher() : undefined;
    const res = await fetch(`${c.apiServer.replace(/\/$/, '')}${path}`, {
      method,
      headers: { Authorization: `Bearer ${c.token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      ...(dispatcher ? { dispatcher } : {}),
    } as RequestInit);
    if (!res.ok) throw new Error(`${this.kind} ${method} ${path}: ${res.status} ${await res.text()}`);
    if (res.status === 204) return {} as T;
    return res.json() as Promise<T>;
  }

  private vmsPath(name?: string): string {
    const c = this.cfg();
    const base = `/apis/kubevirt.io/v1/namespaces/${c.namespace}/virtualmachines`;
    return name ? `${base}/${name}` : base;
  }

  async createInstance(spec: VMInstanceSpec): Promise<VMInstance> {
    const c = this.cfg();
    const cores = spec.resources?.cores ?? 2;
    const memMb = spec.resources?.memoryMb ?? 4096;
    const vm = {
      apiVersion: 'kubevirt.io/v1',
      kind: 'VirtualMachine',
      metadata: { name: spec.name, namespace: c.namespace },
      spec: {
        running: true,
        template: {
          spec: {
            domain: {
              cpu: { cores },
              resources: { requests: { memory: `${memMb}Mi` } },
              devices: {
                disks: [{ name: 'rootdisk', disk: { bus: 'virtio' } }],
                interfaces: [{ name: 'default', masquerade: {} }],
              },
            },
            networks: [{ name: 'default', pod: {} }],
            volumes: [
              { name: 'rootdisk', containerDisk: { image: spec.template || c.image } },
            ],
          },
        },
      },
    };
    const res = await this.k8s<{ metadata: { name: string; uid: string } }>('POST', this.vmsPath(), vm);
    return { id: res.metadata.name, name: spec.name, status: 'provisioning' };
  }

  async destroyInstance(id: string): Promise<void> {
    await this.k8s('DELETE', this.vmsPath(id)).catch(() => undefined);
  }

  async getInstance(id: string): Promise<VMInstance | null> {
    try {
      const vm = await this.k8s<{
        metadata: { name: string };
        status?: { printableStatus?: string; ready?: boolean };
      }>('GET', this.vmsPath(id));
      const s = vm.status?.printableStatus;
      const status: VMInstance['status'] =
        vm.status?.ready || s === 'Running' ? 'running' : s === 'Stopped' ? 'stopped' : 'provisioning';
      return { id, name: vm.metadata.name, status };
    } catch {
      return null;
    }
  }
}

export class KubeVirtDriver extends KubeVirtBase {
  constructor(config: Record<string, unknown>) {
    super(config, 'KUBEVIRT');
  }
}

export class HarvesterDriver extends KubeVirtBase {
  constructor(config: Record<string, unknown>) {
    super(config, 'HARVESTER');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// XML helpers (minimal — avoids xml parser dep for the EC2 Query API)
// ─────────────────────────────────────────────────────────────────────────────

function xmlValue(xml: unknown, tag: string): string | undefined {
  if (typeof xml !== 'string') return undefined;
  const re = new RegExp(`<${tag}[^>]*>([^<]+)<\\/${tag}>`);
  return re.exec(xml)?.[1];
}

/** Minimal XML to text (returns raw XML as-is; callers use xmlValue()). */
function parseSimpleXml(text: string): string {
  return text;
}

/** Factory: resolve a driver for a stored VMProvider row. */
export function resolveVMDriver(
  provider: string,
  config: Record<string, unknown>,
): VMProviderDriver | null {
  switch (provider) {
    case 'PROXMOX':
      return new ProxmoxDriver(config);
    // Accept both the contract enum names (AWS/AZURE/GCP) and the explicit
    // service-qualified aliases (AWS_EC2/AZURE_VM/GCP_CE).
    case 'AWS':
    case 'AWS_EC2':
      return new AwsEc2Driver(config);
    case 'AZURE':
    case 'AZURE_VM':
      return new AzureVmDriver(config);
    case 'GCP':
    case 'GCP_CE':
      return new GcpDriver(config);
    case 'VSPHERE':
      return new VSphereDriver(config);
    case 'DIGITALOCEAN':
      return new DigitalOceanDriver(config);
    case 'ORACLE':
      return new OracleOciDriver(config);
    case 'OPENSTACK':
      return new OpenStackDriver(config);
    case 'NUTANIX':
      return new NutanixDriver(config);
    case 'KUBEVIRT':
      return new KubeVirtDriver(config);
    case 'HARVESTER':
      return new HarvesterDriver(config);
    default:
      return null;
  }
}
