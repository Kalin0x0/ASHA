'use client';

import { Loader2, Plus, ShieldHalf, Trash2 } from 'lucide-react';
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
  type ApiBrowserIsolation,
  createBrowserIsolation,
  deleteBrowserIsolation,
  getBrowserIsolation,
  updateBrowserIsolation,
} from '@/lib/api/endpoints';
import { isLive } from '@/lib/api/mode';

export default function BrowserIsolationPage() {
  const t = useTranslations('connectivity');
  const tc = useTranslations('common');
  const [configs, setConfigs] = useState<ApiBrowserIsolation[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [forwardProxy, setForwardProxy] = useState('');
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    if (!isLive) return;
    setLoading(true);
    try {
      setConfigs(await getBrowserIsolation());
    } catch {
      toast.error(t('browserIsolation.toasts.loadFailed'));
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
      await createBrowserIsolation({ name, forwardProxy: forwardProxy || undefined, enabled: false });
      toast.success(t('browserIsolation.toasts.created'), { description: t('browserIsolation.toasts.createdDescription') });
      setName('');
      setForwardProxy('');
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('browserIsolation.toasts.createFailed'));
    } finally {
      setCreating(false);
    }
  };

  const onToggle = async (c: ApiBrowserIsolation) => {
    setBusyId(c.id);
    try {
      await updateBrowserIsolation(c.id, { enabled: !c.enabled });
      await refresh();
    } catch {
      toast.error(t('browserIsolation.toasts.updateFailed'));
    } finally {
      setBusyId(null);
    }
  };

  const onDelete = async (id: string) => {
    setBusyId(id);
    try {
      await deleteBrowserIsolation(id);
      toast.success(t('browserIsolation.toasts.removed'));
      await refresh();
    } catch {
      toast.error(t('browserIsolation.toasts.removeFailed'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('browserIsolation.title')}
        description={t('browserIsolation.description')}
      />

      {!isLive && (
        <Card elevation={1} className="p-4 text-sm text-muted-foreground">
          {t.rich('browserIsolation.liveOnly', {
            code: (chunks) => (
              <code className="rounded bg-anthracite-950/60 px-1.5 py-0.5 text-xs">{chunks}</code>
            ),
          })}
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label={t('browserIsolation.stats.profiles')} value={configs.length} icon={ShieldHalf} primary />
        <StatCard label={tc('labels.enabled')} value={configs.filter((c) => c.enabled).length} icon={ShieldHalf} />
      </div>

      <Card elevation={1} className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border-subtle p-4">
          <h2 className="font-display text-lg font-medium">{t('browserIsolation.profilesTitle')}</h2>
          {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        </div>
        <div className="divide-y divide-border-subtle/60">
          {configs.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">{t('browserIsolation.empty')}</p>
          ) : (
            configs.map((c) => (
              <div key={c.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <ShieldHalf className="size-4 text-gold-300" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{c.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{c.forwardProxy ? t('browserIsolation.via', { proxy: c.forwardProxy }) : t('browserIsolation.direct')}</p>
                </div>
                <Badge variant={c.enabled ? 'success' : 'outline'}>{c.enabled ? tc('labels.enabled') : tc('labels.disabled')}</Badge>
                <Button variant="secondary" size="sm" disabled={busyId === c.id} onClick={() => void onToggle(c)}>
                  {c.enabled ? tc('actions.disable') : tc('actions.enable')}
                </Button>
                <Button variant="ghost" size="icon-sm" disabled={busyId === c.id} onClick={() => void onDelete(c.id)}>
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            ))
          )}
        </div>
      </Card>

      <Card elevation={1} className="space-y-4 p-5">
        <h2 className="font-display text-lg font-medium">{t('browserIsolation.addTitle')}</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label>{tc('labels.name')}</Label>
            <Input placeholder="risky-web" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>{t('browserIsolation.form.forwardProxy')}</Label>
            <Input placeholder="squid-eu" value={forwardProxy} onChange={(e) => setForwardProxy(e.target.value)} />
          </div>
        </div>
        <Button size="sm" onClick={() => void onCreate()} disabled={!isLive || !name || creating}>
          {creating ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
          {t('browserIsolation.addButton')}
        </Button>
      </Card>
    </div>
  );
}
