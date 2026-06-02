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

/** Factory: resolve a driver for a stored VMProvider row. */
export function resolveVMDriver(
  provider: string,
  config: Record<string, unknown>,
): VMProviderDriver | null {
  switch (provider) {
    case 'PROXMOX':
      return new ProxmoxDriver(config);
    default:
      // Other providers (AWS, Azure, vSphere, …) not yet implemented.
      return null;
  }
}
