'use client';

import { Loader2, Plus, Send, Trash2, Webhook, Zap } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/composite/empty-state';
import { PageHeader } from '@/components/composite/page-header';
import { StatCard } from '@/components/composite/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useConfirm } from '@/components/ui/confirm';
import { Input, Label } from '@/components/ui/input';
import {
  type ApiWebhook,
  createWebhook,
  deleteWebhook,
  getWebhooks,
  testWebhook,
  updateWebhook,
} from '@/lib/api/endpoints';
import { isLive } from '@/lib/api/mode';

const EVENT_OPTIONS = [
  'session.created',
  'session.started',
  'session.ended',
  'session.destroyed',
  'user.created',
  'user.disabled',
  'recording.completed',
];

export default function WebhooksPage() {
  const t = useTranslations('developer');
  const tCommon = useTranslations('common');
  const confirm = useConfirm();
  const [webhooks, setWebhooks] = useState<ApiWebhook[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [events, setEvents] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    if (!isLive) return;
    setLoading(true);
    try {
      setWebhooks(await getWebhooks());
    } catch {
      toast.error(t('webhooks.loadError'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const toggleEvent = (e: string) =>
    setEvents((cur) => (cur.includes(e) ? cur.filter((x) => x !== e) : [...cur, e]));

  const onCreate = async () => {
    if (!name || !url || events.length === 0) return;
    setCreating(true);
    try {
      await createWebhook({ name, url, events, secret: secret || undefined, enabled: true });
      toast.success(t('webhooks.createdToast'));
      setName('');
      setUrl('');
      setSecret('');
      setEvents([]);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('webhooks.createError'));
    } finally {
      setCreating(false);
    }
  };

  const onToggle = async (w: ApiWebhook) => {
    setBusyId(w.id);
    try {
      await updateWebhook(w.id, { enabled: !w.enabled });
      await refresh();
    } catch {
      toast.error(t('webhooks.updateError'));
    } finally {
      setBusyId(null);
    }
  };

  const onTest = async (id: string) => {
    setBusyId(id);
    try {
      const res = await testWebhook(id);
      const httpLabel = res.responseCode != null ? `HTTP ${res.responseCode}` : undefined;
      if (res.status === 'SUCCESS') toast.success(t('webhooks.testDelivered'), { description: httpLabel });
      else toast.error(t('webhooks.testFailed'), { description: httpLabel });
    } catch {
      toast.error(t('webhooks.testDeliveryFailed'));
    } finally {
      setBusyId(null);
    }
  };

  const onDelete = async (id: string) => {
    const webhook = webhooks.find((w) => w.id === id);
    if (!(await confirm({ title: tCommon('confirm.deleteNamed', { name: webhook?.name ?? '' }) }))) return;
    setBusyId(id);
    try {
      await deleteWebhook(id);
      toast.success(t('webhooks.deletedToast'));
      await refresh();
    } catch {
      toast.error(t('webhooks.deleteError'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('webhooks.title')}
        description={t('webhooks.description')}
      />

      {!isLive && (
        <Card elevation={1} className="p-4 text-sm text-muted-foreground">
          {t('webhooks.liveOnlyNotice')}{' '}
          <code className="rounded bg-anthracite-950/60 px-1.5 py-0.5 text-xs">NEXT_PUBLIC_API_MODE=live</code>.
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label={t('webhooks.title')} value={webhooks.length} icon={Webhook} primary />
        <StatCard label={tCommon('labels.enabled')} value={webhooks.filter((w) => w.enabled).length} icon={Webhook} />
      </div>

      <Card elevation={1} className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border-subtle p-4">
          <h2 className="font-display text-lg font-medium">{t('webhooks.endpoints')}</h2>
          {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        </div>
        <div className="divide-y divide-border-subtle/60">
          {webhooks.length === 0 ? (
            <EmptyState icon={Webhook} title={t('webhooks.emptyTitle')} description={t('webhooks.emptyDescription')} />
          ) : (
            webhooks.map((w) => (
              <div key={w.id} className="flex items-center gap-3 px-5 py-3 text-sm transition-all duration-150 hover:bg-gold-500/[0.05] hover:shadow-[inset_2px_0_0_rgba(212,175,55,0.55)]">
                <Webhook className="size-4 text-gold-300" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{w.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{w.url}</p>
                </div>
                <span className="hidden text-xs text-muted-foreground sm:inline">{t('webhooks.eventCount', { count: w.events.length })}</span>
                <Badge variant={w.enabled ? 'success' : 'outline'}>{w.enabled ? tCommon('labels.enabled') : tCommon('labels.disabled')}</Badge>
                <Button variant="ghost" size="icon-sm" title={t('webhooks.sendTest')} disabled={busyId === w.id} onClick={() => void onTest(w.id)}>
                  {busyId === w.id ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                </Button>
                <Button variant="secondary" size="sm" disabled={busyId === w.id} onClick={() => void onToggle(w)}>
                  {w.enabled ? tCommon('actions.disable') : tCommon('actions.enable')}
                </Button>
                <Button variant="ghost" size="icon-sm" disabled={busyId === w.id} onClick={() => void onDelete(w.id)}>
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            ))
          )}
        </div>
      </Card>

      <Card elevation={1} className="space-y-4 p-5">
        <h2 className="font-display text-lg font-medium">{t('webhooks.addWebhook')}</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label>{tCommon('labels.name')}</Label>
            <Input placeholder="ops-notifier" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>{t('webhooks.payloadUrl')}</Label>
            <Input placeholder="https://hooks.example.com/asha" value={url} onChange={(e) => setUrl(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label>{t('webhooks.signingSecret')}</Label>
            <Input type="password" placeholder={t('webhooks.secretPlaceholder')} value={secret} onChange={(e) => setSecret(e.target.value)} />
          </div>
        </div>
        <div>
          <Label className="mb-1.5 flex items-center gap-1.5">
            <Zap className="size-3.5" /> {t('webhooks.events')}
          </Label>
          <div className="flex flex-wrap gap-2">
            {EVENT_OPTIONS.map((e) => (
              <button
                key={e}
                onClick={() => toggleEvent(e)}
                className={`rounded-md border px-2.5 py-1 font-mono text-[11px] transition-colors ${
                  events.includes(e)
                    ? 'border-[rgba(212,175,55,0.4)] bg-gold-500/10 text-gold-300'
                    : 'border-border-subtle text-muted-foreground hover:bg-secondary'
                }`}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
        <Button size="sm" onClick={() => void onCreate()} disabled={!isLive || !name || !url || events.length === 0 || creating}>
          {creating ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
          {t('webhooks.addWebhook')}
        </Button>
      </Card>
    </div>
  );
}
