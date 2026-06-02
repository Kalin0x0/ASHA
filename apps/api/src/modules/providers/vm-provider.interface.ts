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

/**
 * Proxmox VE driver skeleton. Real calls go through the Proxmox API
 * (`/api2/json/nodes/{node}/qemu/...`). Network calls are stubbed until a live
 * Proxmox endpoint is wired in deployment; config validation is real so a
 * misconfigured provider is caught early.
 */
export class ProxmoxDriver implements VMProviderDriver {
  readonly kind = 'PROXMOX';

  constructor(private readonly config: Record<string, unknown>) {}

  validateConfig(): { ok: true } | { ok: false; reason: string } {
    const required = ['apiUrl', 'node', 'tokenId', 'tokenSecret'];
    const missing = required.filter((k) => !this.config[k]);
    if (missing.length) return { ok: false, reason: `Proxmox config missing: ${missing.join(', ')}` };
    return { ok: true };
  }

  createInstance(spec: VMInstanceSpec): Promise<VMInstance> {
    // TODO(deploy): POST /api2/json/nodes/{node}/qemu/{vmid}/clone then start.
    return Promise.resolve({
      id: `proxmox-${spec.name}`,
      name: spec.name,
      status: 'provisioning',
    });
  }

  destroyInstance(_id: string): Promise<void> {
    // TODO(deploy): POST /api2/json/nodes/{node}/qemu/{vmid}/status/stop then delete.
    return Promise.resolve();
  }

  getInstance(id: string): Promise<VMInstance | null> {
    // TODO(deploy): GET /api2/json/nodes/{node}/qemu/{vmid}/status/current.
    return Promise.resolve({ id, name: id, status: 'running' });
  }
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
