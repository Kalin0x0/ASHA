'use client';

import { Cloud, Loader2, Plus, Server, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/composite/page-header';
import { StatCard } from '@/components/composite/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import {
  type ApiVMProvider,
  type VMProviderKind,
  createVMProvider,
  deleteVMProvider,
  getVMProviders,
  updateVMProvider,
} from '@/lib/api/endpoints';
import { isLive } from '@/lib/api/mode';

type ConfigField = { key: string; label: string; placeholder?: string; secret?: boolean };

// Config templates per provider — these mirror the driver `validateConfig()` requirements.
const CONFIG_FIELDS: Partial<Record<VMProviderKind, ConfigField[]>> = {
  PROXMOX: [
    { key: 'apiUrl', label: 'API URL', placeholder: 'https://pve.example.com:8006' },
    { key: 'node', label: 'Node', placeholder: 'pve' },
    { key: 'tokenId', label: 'Token ID', placeholder: 'root@pam!chista' },
    { key: 'tokenSecret', label: 'Token Secret', secret: true },
    { key: 'template', label: 'Template VMID', placeholder: '9000' },
  ],
  AWS: [
    { key: 'accessKeyId', label: 'Access Key ID' },
    { key: 'secretAccessKey', label: 'Secret Access Key', secret: true },
    { key: 'region', label: 'Region', placeholder: 'us-east-1' },
    { key: 'imageId', label: 'AMI ID', placeholder: 'ami-0abc...' },
    { key: 'instanceType', label: 'Instance Type', placeholder: 't3.medium' },
  ],
  AZURE: [
    { key: 'tenantId', label: 'Tenant ID' },
    { key: 'clientId', label: 'Client ID' },
    { key: 'clientSecret', label: 'Client Secret', secret: true },
    { key: 'subscriptionId', label: 'Subscription ID' },
    { key: 'resourceGroup', label: 'Resource Group' },
    { key: 'location', label: 'Location', placeholder: 'eastus' },
    { key: 'vmSize', label: 'VM Size', placeholder: 'Standard_B2s' },
  ],
  GCP: [
    { key: 'projectId', label: 'Project ID' },
    { key: 'zone', label: 'Zone', placeholder: 'us-central1-a' },
    { key: 'serviceAccountEmail', label: 'Service Account Email' },
    { key: 'privateKeyPem', label: 'Private Key (PEM)', secret: true },
    { key: 'machineType', label: 'Machine Type', placeholder: 'e2-medium' },
    { key: 'sourceImage', label: 'Source Image', placeholder: 'projects/debian-cloud/global/images/family/debian-12' },
  ],
  VSPHERE: [
    { key: 'vcenterUrl', label: 'vCenter URL', placeholder: 'https://vcenter.example.com' },
    { key: 'username', label: 'Username', placeholder: 'administrator@vsphere.local' },
    { key: 'password', label: 'Password', secret: true },
    { key: 'template', label: 'Template VM', placeholder: 'ubuntu-22-template' },
  ],
};

const IMPLEMENTED: VMProviderKind[] = ['PROXMOX', 'AWS', 'AZURE', 'GCP', 'VSPHERE'];

export default function VMProvidersPage() {
  const [providers, setProviders] = useState<ApiVMProvider[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [kind, setKind] = useState<VMProviderKind>('PROXMOX');
  const [name, setName] = useState('');
  const [config, setConfig] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    if (!isLive) return;
    setLoading(true);
    try {
      setProviders(await getVMProviders());
    } catch {
      toast.error('Failed to load VM providers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onCreate = async () => {
    if (!name) return;
    setCreating(true);
    try {
      await createVMProvider({ name, provider: kind, config, enabled: true });
      toast.success(`${kind} provider added`);
      setName('');
      setConfig({});
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not create provider');
    } finally {
      setCreating(false);
    }
  };

  const onToggle = async (p: ApiVMProvider) => {
    setBusyId(p.id);
    try {
      await updateVMProvider(p.id, { enabled: !p.enabled });
      await refresh();
    } catch {
      toast.error('Could not update provider');
    } finally {
      setBusyId(null);
    }
  };

  const onDelete = async (id: string) => {
    setBusyId(id);
    try {
      await deleteVMProvider(id);
      toast.success('Provider removed');
      await refresh();
    } catch {
      toast.error('Could not remove provider');
    } finally {
      setBusyId(null);
    }
  };

  const fields = CONFIG_FIELDS[kind] ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="VM Providers"
        description="Connect cloud and hypervisor providers to back autoscaled server pools. Drivers: Proxmox VE, AWS EC2, Azure, GCP, and VMware vSphere."
      />

      {!isLive && (
        <Card elevation={1} className="p-4 text-sm text-muted-foreground">
          VM provider management is live-backend only. Run with{' '}
          <code className="rounded bg-anthracite-950/60 px-1.5 py-0.5 text-xs">NEXT_PUBLIC_API_MODE=live</code>.
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Providers" value={providers.length} icon={Cloud} primary />
        <StatCard label="Enabled" value={providers.filter((p) => p.enabled).length} icon={Server} />
        <StatCard label="Drivers" value={IMPLEMENTED.length} icon={Server} />
      </div>

      <Card elevation={1} className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border-subtle p-4">
          <h2 className="font-display text-lg font-medium">Configured providers</h2>
          {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        </div>
        <div className="divide-y divide-border-subtle/60">
          {providers.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">No VM providers configured yet.</p>
          ) : (
            providers.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <Cloud className="size-4 text-gold-300" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{p.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {String((p.config as Record<string, unknown>).apiUrl ?? (p.config as Record<string, unknown>).region ?? (p.config as Record<string, unknown>).vcenterUrl ?? (p.config as Record<string, unknown>).location ?? '—')}
                  </p>
                </div>
                <Badge variant="gold">{p.provider}</Badge>
                <Badge variant={p.enabled ? 'success' : 'outline'}>{p.enabled ? 'Enabled' : 'Disabled'}</Badge>
                <Button variant="secondary" size="sm" disabled={busyId === p.id} onClick={() => void onToggle(p)}>
                  {p.enabled ? 'Disable' : 'Enable'}
                </Button>
                <Button variant="ghost" size="icon-sm" disabled={busyId === p.id} onClick={() => void onDelete(p.id)}>
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            ))
          )}
        </div>
      </Card>

      <Card elevation={1} className="space-y-4 p-5">
        <h2 className="font-display text-lg font-medium">Add provider</h2>
        <div className="flex flex-wrap gap-2">
          {IMPLEMENTED.map((k) => (
            <button
              key={k}
              onClick={() => {
                setKind(k);
                setConfig({});
              }}
              className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
                kind === k
                  ? 'border-[rgba(212,175,55,0.4)] bg-gold-500/10 text-gold-300'
                  : 'border-border-subtle text-muted-foreground hover:bg-secondary'
              }`}
            >
              {k}
            </button>
          ))}
        </div>

        <div>
          <Label>Display name</Label>
          <Input placeholder={`${kind} cluster`} value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {fields.map((f) => (
            <div key={f.key}>
              <Label>{f.label}</Label>
              <Input
                type={f.secret ? 'password' : 'text'}
                placeholder={f.placeholder}
                value={config[f.key] ?? ''}
                onChange={(e) => setConfig((c) => ({ ...c, [f.key]: e.target.value }))}
              />
            </div>
          ))}
        </div>

        <Button size="sm" onClick={() => void onCreate()} disabled={!isLive || !name || creating}>
          {creating ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
          Add provider
        </Button>
      </Card>
    </div>
  );
}
