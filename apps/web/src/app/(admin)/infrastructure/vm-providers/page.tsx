'use client';

import { Cloud, Loader2, Plus, Server, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
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

type ConfigField = { key: string; placeholder?: string; secret?: boolean };

// Config templates per provider — these mirror the driver `validateConfig()` requirements.
// Field labels resolve at render via i18n (`infrastructure.vmProviders.fields.<KIND>.<key>`).
const CONFIG_FIELDS: Partial<Record<VMProviderKind, ConfigField[]>> = {
  PROXMOX: [
    { key: 'apiUrl', placeholder: 'https://pve.example.com:8006' },
    { key: 'node', placeholder: 'pve' },
    { key: 'tokenId', placeholder: 'root@pam!chista' },
    { key: 'tokenSecret', secret: true },
    { key: 'template', placeholder: '9000' },
  ],
  AWS: [
    { key: 'accessKeyId' },
    { key: 'secretAccessKey', secret: true },
    { key: 'region', placeholder: 'us-east-1' },
    { key: 'imageId', placeholder: 'ami-0abc...' },
    { key: 'instanceType', placeholder: 't3.medium' },
  ],
  AZURE: [
    { key: 'tenantId' },
    { key: 'clientId' },
    { key: 'clientSecret', secret: true },
    { key: 'subscriptionId' },
    { key: 'resourceGroup' },
    { key: 'location', placeholder: 'eastus' },
    { key: 'vmSize', placeholder: 'Standard_B2s' },
  ],
  GCP: [
    { key: 'projectId' },
    { key: 'zone', placeholder: 'us-central1-a' },
    { key: 'serviceAccountEmail' },
    { key: 'privateKeyPem', secret: true },
    { key: 'machineType', placeholder: 'e2-medium' },
    { key: 'sourceImage', placeholder: 'projects/debian-cloud/global/images/family/debian-12' },
  ],
  VSPHERE: [
    { key: 'vcenterUrl', placeholder: 'https://vcenter.example.com' },
    { key: 'username', placeholder: 'administrator@vsphere.local' },
    { key: 'password', secret: true },
    { key: 'template', placeholder: 'ubuntu-22-template' },
  ],
  DIGITALOCEAN: [
    { key: 'apiToken', secret: true },
    { key: 'region', placeholder: 'nyc3' },
    { key: 'size', placeholder: 's-2vcpu-4gb' },
    { key: 'image', placeholder: 'ubuntu-22-04-x64' },
  ],
  ORACLE: [
    { key: 'endpoint', placeholder: 'iaas.us-ashburn-1.oraclecloud.com' },
    { key: 'tenancyOcid' },
    { key: 'userOcid' },
    { key: 'fingerprint' },
    { key: 'privateKeyPem', secret: true },
    { key: 'compartmentOcid' },
    { key: 'availabilityDomain' },
    { key: 'shape', placeholder: 'VM.Standard.E4.Flex' },
    { key: 'subnetOcid' },
    { key: 'imageOcid' },
  ],
  OPENSTACK: [
    { key: 'authUrl', placeholder: 'https://keystone:5000/v3' },
    { key: 'username' },
    { key: 'password', secret: true },
    { key: 'projectName' },
    { key: 'novaUrl', placeholder: 'https://nova:8774/v2.1' },
    { key: 'flavorRef' },
    { key: 'imageRef' },
    { key: 'networkId' },
  ],
  NUTANIX: [
    { key: 'prismCentralUrl', placeholder: 'https://pc.example.com:9440' },
    { key: 'username' },
    { key: 'password', secret: true },
    { key: 'clusterUuid' },
    { key: 'subnetUuid' },
    { key: 'imageUuid' },
  ],
  KUBEVIRT: [
    { key: 'apiServer', placeholder: 'https://k8s.example.com:6443' },
    { key: 'token', secret: true },
    { key: 'namespace', placeholder: 'vms' },
    { key: 'image', placeholder: 'quay.io/containerdisks/ubuntu:22.04' },
  ],
  HARVESTER: [
    { key: 'apiServer', placeholder: 'https://harvester.example.com:6443' },
    { key: 'token', secret: true },
    { key: 'namespace', placeholder: 'default' },
    { key: 'image', placeholder: 'default/ubuntu-22.04' },
  ],
};

const IMPLEMENTED: VMProviderKind[] = [
  'PROXMOX', 'AWS', 'AZURE', 'GCP', 'VSPHERE', 'DIGITALOCEAN', 'ORACLE', 'OPENSTACK',
  'NUTANIX', 'KUBEVIRT', 'HARVESTER',
];

export default function VMProvidersPage() {
  const t = useTranslations('infrastructure');
  const tc = useTranslations('common');
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
      toast.error(t('vmProviders.toasts.loadFailed'));
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
      toast.success(t('vmProviders.toasts.created', { kind: t(`vmProviders.kinds.${kind}`) }));
      setName('');
      setConfig({});
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('vmProviders.toasts.createFailed'));
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
      toast.error(t('vmProviders.toasts.updateFailed'));
    } finally {
      setBusyId(null);
    }
  };

  const onDelete = async (id: string) => {
    setBusyId(id);
    try {
      await deleteVMProvider(id);
      toast.success(t('vmProviders.toasts.removed'));
      await refresh();
    } catch {
      toast.error(t('vmProviders.toasts.removeFailed'));
    } finally {
      setBusyId(null);
    }
  };

  const fields = CONFIG_FIELDS[kind] ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('vmProviders.title')}
        description={t('vmProviders.description')}
      />

      {!isLive && (
        <Card elevation={1} className="p-4 text-sm text-muted-foreground">
          {t.rich('vmProviders.liveOnly', {
            code: (chunks) => (
              <code className="rounded bg-anthracite-950/60 px-1.5 py-0.5 text-xs">{chunks}</code>
            ),
          })}
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label={t('vmProviders.stats.providers')} value={providers.length} icon={Cloud} primary />
        <StatCard label={tc('labels.enabled')} value={providers.filter((p) => p.enabled).length} icon={Server} />
        <StatCard label={t('vmProviders.stats.drivers')} value={IMPLEMENTED.length} icon={Server} />
      </div>

      <Card elevation={1} className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border-subtle p-4">
          <h2 className="font-display text-lg font-medium">{t('vmProviders.configuredProviders')}</h2>
          {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        </div>
        <div className="divide-y divide-border-subtle/60">
          {providers.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">{t('vmProviders.empty')}</p>
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
                <Badge variant="gold">{t(`vmProviders.kinds.${p.provider}`)}</Badge>
                <Badge variant={p.enabled ? 'success' : 'outline'}>{p.enabled ? tc('labels.enabled') : tc('labels.disabled')}</Badge>
                <Button variant="secondary" size="sm" disabled={busyId === p.id} onClick={() => void onToggle(p)}>
                  {p.enabled ? tc('actions.disable') : tc('actions.enable')}
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
        <h2 className="font-display text-lg font-medium">{t('vmProviders.addProvider')}</h2>
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
              {t(`vmProviders.kinds.${k}`)}
            </button>
          ))}
        </div>

        <div>
          <Label>{t('vmProviders.form.displayName')}</Label>
          <Input placeholder={t('vmProviders.form.namePlaceholder', { kind: t(`vmProviders.kinds.${kind}`) })} value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {fields.map((f) => (
            <div key={f.key}>
              <Label>{t(`vmProviders.fields.${kind}.${f.key}`)}</Label>
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
          {t('vmProviders.addProvider')}
        </Button>
      </Card>
    </div>
  );
}
