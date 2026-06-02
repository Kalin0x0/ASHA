'use client';

import { Loader2, Plus, Route, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/composite/page-header';
import { StatCard } from '@/components/composite/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import {
  type ApiDNSProvider,
  type DNSProviderKind,
  createDNSProvider,
  deleteDNSProvider,
  getDNSProviders,
  updateDNSProvider,
} from '@/lib/api/endpoints';
import { isLive } from '@/lib/api/mode';

type ConfigField = { key: string; label: string; placeholder?: string; secret?: boolean };

const CONFIG_FIELDS: Record<DNSProviderKind, ConfigField[]> = {
  AWS: [
    { key: 'accessKeyId', label: 'Access Key ID' },
    { key: 'secretAccessKey', label: 'Secret Access Key', secret: true },
    { key: 'hostedZoneId', label: 'Hosted Zone ID' },
  ],
  AZURE: [
    { key: 'tenantId', label: 'Tenant ID' },
    { key: 'clientId', label: 'Client ID' },
    { key: 'clientSecret', label: 'Client Secret', secret: true },
    { key: 'subscriptionId', label: 'Subscription ID' },
    { key: 'resourceGroup', label: 'Resource Group' },
  ],
  DIGITALOCEAN: [{ key: 'apiToken', label: 'API Token', secret: true }],
  GCP: [
    { key: 'projectId', label: 'Project ID' },
    { key: 'serviceAccountKey', label: 'Service Account Key (JSON)', secret: true },
  ],
  ORACLE: [
    { key: 'tenancyOcid', label: 'Tenancy OCID' },
    { key: 'userOcid', label: 'User OCID' },
    { key: 'fingerprint', label: 'Fingerprint' },
    { key: 'privateKeyPem', label: 'Private Key (PEM)', secret: true },
    { key: 'compartmentOcid', label: 'Compartment OCID' },
  ],
};

const KINDS: DNSProviderKind[] = ['AWS', 'AZURE', 'DIGITALOCEAN', 'GCP', 'ORACLE'];

export default function DNSProvidersPage() {
  const [providers, setProviders] = useState<ApiDNSProvider[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [kind, setKind] = useState<DNSProviderKind>('AWS');
  const [name, setName] = useState('');
  const [zoneName, setZoneName] = useState('');
  const [config, setConfig] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    if (!isLive) return;
    setLoading(true);
    try {
      setProviders(await getDNSProviders());
    } catch {
      toast.error('Failed to load DNS providers');
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
      await createDNSProvider({ name, provider: kind, zoneName: zoneName || undefined, config, enabled: true });
      toast.success(`${kind} DNS provider added`);
      setName('');
      setZoneName('');
      setConfig({});
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not create provider');
    } finally {
      setCreating(false);
    }
  };

  const onToggle = async (p: ApiDNSProvider) => {
    setBusyId(p.id);
    try {
      await updateDNSProvider(p.id, { enabled: !p.enabled });
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
      await deleteDNSProvider(id);
      toast.success('Provider removed');
      await refresh();
    } catch {
      toast.error('Could not remove provider');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="DNS Providers"
        description="Register DNS providers so autoscaled servers and per-session hostnames get DNS records created automatically."
      />

      {!isLive && (
        <Card elevation={1} className="p-4 text-sm text-muted-foreground">
          DNS provider management is live-backend only. Run with{' '}
          <code className="rounded bg-anthracite-950/60 px-1.5 py-0.5 text-xs">NEXT_PUBLIC_API_MODE=live</code>.
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label="Providers" value={providers.length} icon={Route} primary />
        <StatCard label="Enabled" value={providers.filter((p) => p.enabled).length} icon={Route} />
      </div>

      <Card elevation={1} className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border-subtle p-4">
          <h2 className="font-display text-lg font-medium">Configured providers</h2>
          {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        </div>
        <div className="divide-y divide-border-subtle/60">
          {providers.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">No DNS providers configured yet.</p>
          ) : (
            providers.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <Route className="size-4 text-gold-300" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{p.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{p.zoneName ?? '—'}</p>
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
          {KINDS.map((k) => (
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label>Display name</Label>
            <Input placeholder={`${kind} DNS`} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>Zone name (optional)</Label>
            <Input placeholder="example.com" value={zoneName} onChange={(e) => setZoneName(e.target.value)} />
          </div>
          {CONFIG_FIELDS[kind].map((f) => (
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
