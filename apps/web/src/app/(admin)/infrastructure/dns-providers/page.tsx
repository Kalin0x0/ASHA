'use client';

import { Loader2, Plus, Route, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/composite/page-header';
import { StatCard } from '@/components/composite/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useConfirm } from '@/components/ui/confirm';
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

type ConfigField = { key: string; placeholder?: string; secret?: boolean };

// Field labels resolve at render via i18n (`infrastructure.dnsProviders.fields.<KIND>.<key>`).
const CONFIG_FIELDS: Record<DNSProviderKind, ConfigField[]> = {
  AWS: [
    { key: 'accessKeyId' },
    { key: 'secretAccessKey', secret: true },
    { key: 'hostedZoneId' },
  ],
  AZURE: [
    { key: 'tenantId' },
    { key: 'clientId' },
    { key: 'clientSecret', secret: true },
    { key: 'subscriptionId' },
    { key: 'resourceGroup' },
  ],
  DIGITALOCEAN: [{ key: 'apiToken', secret: true }],
  GCP: [
    { key: 'projectId' },
    { key: 'serviceAccountKey', secret: true },
  ],
  ORACLE: [
    { key: 'tenancyOcid' },
    { key: 'userOcid' },
    { key: 'fingerprint' },
    { key: 'privateKeyPem', secret: true },
    { key: 'compartmentOcid' },
  ],
};

const KINDS: DNSProviderKind[] = ['AWS', 'AZURE', 'DIGITALOCEAN', 'GCP', 'ORACLE'];

export default function DNSProvidersPage() {
  const t = useTranslations('infrastructure');
  const tc = useTranslations('common');
  const confirm = useConfirm();
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
      toast.error(t('dnsProviders.toasts.loadFailed'));
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
      toast.success(t('dnsProviders.toasts.created', { kind: t(`dnsProviders.kinds.${kind}`) }));
      setName('');
      setZoneName('');
      setConfig({});
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('dnsProviders.toasts.createFailed'));
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
      toast.error(t('dnsProviders.toasts.updateFailed'));
    } finally {
      setBusyId(null);
    }
  };

  const onDelete = async (id: string) => {
    const provider = providers.find((p) => p.id === id);
    if (!(await confirm({ title: tc('confirm.deleteNamed', { name: provider?.name ?? '' }) }))) return;
    setBusyId(id);
    try {
      await deleteDNSProvider(id);
      toast.success(t('dnsProviders.toasts.removed'));
      await refresh();
    } catch {
      toast.error(t('dnsProviders.toasts.removeFailed'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('dnsProviders.title')}
        description={t('dnsProviders.description')}
      />

      {!isLive && (
        <Card elevation={1} className="p-4 text-sm text-muted-foreground">
          {t.rich('dnsProviders.liveOnly', {
            code: (chunks) => (
              <code className="rounded bg-anthracite-950/60 px-1.5 py-0.5 text-xs">{chunks}</code>
            ),
          })}
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label={t('dnsProviders.stats.providers')} value={providers.length} icon={Route} primary />
        <StatCard label={tc('labels.enabled')} value={providers.filter((p) => p.enabled).length} icon={Route} />
      </div>

      <Card elevation={1} className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border-subtle p-4">
          <h2 className="font-display text-lg font-medium">{t('dnsProviders.configuredProviders')}</h2>
          {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        </div>
        <div className="divide-y divide-border-subtle/60">
          {providers.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">{t('dnsProviders.empty')}</p>
          ) : (
            providers.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <Route className="size-4 text-gold-300" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{p.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{p.zoneName ?? '—'}</p>
                </div>
                <Badge variant="gold">{t(`dnsProviders.kinds.${p.provider}`)}</Badge>
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
        <h2 className="font-display text-lg font-medium">{t('dnsProviders.addProvider')}</h2>
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
              {t(`dnsProviders.kinds.${k}`)}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label>{t('dnsProviders.form.displayName')}</Label>
            <Input placeholder={t('dnsProviders.form.namePlaceholder', { kind: t(`dnsProviders.kinds.${kind}`) })} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>{t('dnsProviders.form.zoneName')}</Label>
            <Input placeholder="example.com" value={zoneName} onChange={(e) => setZoneName(e.target.value)} />
          </div>
          {CONFIG_FIELDS[kind].map((f) => (
            <div key={f.key}>
              <Label>{t(`dnsProviders.fields.${kind}.${f.key}`)}</Label>
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
          {t('dnsProviders.addProvider')}
        </Button>
      </Card>
    </div>
  );
}
