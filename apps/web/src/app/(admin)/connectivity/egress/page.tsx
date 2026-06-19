'use client';

import { Copy, DoorOpen, Loader2, Plus, Trash2 } from 'lucide-react';
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
  type ApiEgressGateway,
  createEgressGateway,
  deleteEgressGateway,
  getEgressGateways,
  getWireguardConfig,
  updateEgressGateway,
} from '@/lib/api/endpoints';
import { isLive } from '@/lib/api/mode';

const PROVIDERS = ['wireguard', 'http_proxy', 'socks5'];

export default function EgressPage() {
  const t = useTranslations('connectivity');
  const tc = useTranslations('common');
  const confirm = useConfirm();
  const [gateways, setGateways] = useState<ApiEgressGateway[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [provider, setProvider] = useState('wireguard');
  const [endpoint, setEndpoint] = useState('');
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    if (!isLive) return;
    setLoading(true);
    try {
      setGateways(await getEgressGateways());
    } catch {
      toast.error(t('egress.toasts.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onCreate = async () => {
    if (!name) return;
    setCreating(true);
    try {
      await createEgressGateway({
        name,
        provider,
        config: endpoint ? { endpoint } : {},
        enabled: false,
      });
      toast.success(t('egress.toasts.created'), { description: t('egress.toasts.createdDescription') });
      setName('');
      setEndpoint('');
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('egress.toasts.createFailed'));
    } finally {
      setCreating(false);
    }
  };

  const onToggle = async (g: ApiEgressGateway) => {
    setBusyId(g.id);
    try {
      await updateEgressGateway(g.id, { enabled: !g.enabled });
      await refresh();
    } catch {
      toast.error(t('egress.toasts.updateFailed'));
    } finally {
      setBusyId(null);
    }
  };

  const onCopyConfig = async (id: string) => {
    setBusyId(id);
    try {
      const { content } = await getWireguardConfig(id);
      await navigator.clipboard.writeText(content);
      toast.success(t('egress.toasts.configCopied'));
    } catch {
      toast.error(t('egress.toasts.configCopyFailed'));
    } finally {
      setBusyId(null);
    }
  };

  const onDelete = async (id: string) => {
    const g = gateways.find((x) => x.id === id);
    if (!(await confirm({ title: tc('confirm.deleteNamed', { name: g?.name ?? '' }) }))) return;
    setBusyId(id);
    try {
      await deleteEgressGateway(id);
      toast.success(t('egress.toasts.removed'));
      await refresh();
    } catch {
      toast.error(t('egress.toasts.removeFailed'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('egress.title')}
        description={t('egress.description')}
      />

      {!isLive && (
        <Card elevation={1} className="p-4 text-sm text-muted-foreground">
          {t.rich('egress.liveOnly', {
            code: (chunks) => (
              <code className="rounded bg-anthracite-950/60 px-1.5 py-0.5 text-xs">{chunks}</code>
            ),
          })}
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label={t('egress.stats.gateways')} value={gateways.length} icon={DoorOpen} primary />
        <StatCard label={tc('labels.enabled')} value={gateways.filter((g) => g.enabled).length} icon={DoorOpen} />
      </div>

      <Card elevation={1} className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border-subtle p-4">
          <h2 className="font-display text-lg font-medium">{t('egress.gatewaysTitle')}</h2>
          {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        </div>
        <div className="divide-y divide-border-subtle/60">
          {gateways.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">{t('egress.empty')}</p>
          ) : (
            gateways.map((g) => (
              <div key={g.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <DoorOpen className="size-4 text-gold-300" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{g.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {String((g.config as Record<string, unknown>).endpoint ?? '—')}
                  </p>
                </div>
                <Badge variant="gold">{PROVIDERS.includes(g.provider) ? t(`egress.providers.${g.provider}`) : g.provider}</Badge>
                <Badge variant={g.enabled ? 'success' : 'outline'}>{g.enabled ? tc('labels.enabled') : tc('labels.disabled')}</Badge>
                {g.provider === 'wireguard' && (
                  <Button variant="ghost" size="icon-sm" title={t('egress.copyConfig')} disabled={busyId === g.id} onClick={() => void onCopyConfig(g.id)}>
                    <Copy className="size-4" />
                  </Button>
                )}
                <Button variant="secondary" size="sm" disabled={busyId === g.id} onClick={() => void onToggle(g)}>
                  {g.enabled ? tc('actions.disable') : tc('actions.enable')}
                </Button>
                <Button variant="ghost" size="icon-sm" disabled={busyId === g.id} onClick={() => void onDelete(g.id)}>
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            ))
          )}
        </div>
      </Card>

      <Card elevation={1} className="space-y-4 p-5">
        <h2 className="font-display text-lg font-medium">{t('egress.addTitle')}</h2>
        <div className="flex flex-wrap gap-2">
          {PROVIDERS.map((p) => (
            <button
              key={p}
              onClick={() => setProvider(p)}
              className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
                provider === p
                  ? 'border-[rgba(212,175,55,0.4)] bg-gold-500/10 text-gold-300'
                  : 'border-border-subtle text-muted-foreground hover:bg-secondary'
              }`}
            >
              {t(`egress.providers.${p}`)}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label>{tc('labels.name')}</Label>
            <Input placeholder="egress-eu" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>{t('egress.form.endpoint')}</Label>
            <Input placeholder="vpn.example.com:51820" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} />
          </div>
        </div>
        <Button size="sm" onClick={() => void onCreate()} disabled={!isLive || !name || creating}>
          {creating ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
          {t('egress.addButton')}
        </Button>
      </Card>
    </div>
  );
}
