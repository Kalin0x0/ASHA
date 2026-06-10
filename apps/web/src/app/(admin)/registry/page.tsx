'use client';

import { Boxes, Check, Download, Loader2, Plus, RefreshCw, Store, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/composite/page-header';
import { StatCard } from '@/components/composite/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  type ApiMarketplaceEntry,
  type ApiRegistry,
  createRegistry,
  deleteRegistry,
  getMarketplace,
  getRegistries,
  installMarketplaceEntry,
  syncRegistry,
} from '@/lib/api/endpoints';
import { isLive } from '@/lib/api/mode';

export default function RegistryPage() {
  const t = useTranslations('workspaces');
  const tc = useTranslations('common');
  const [registries, setRegistries] = useState<ApiRegistry[]>([]);
  const [entries, setEntries] = useState<ApiMarketplaceEntry[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [newUrl, setNewUrl] = useState('');
  const [newName, setNewName] = useState('');

  const refresh = useCallback(async () => {
    if (!isLive) return;
    setLoading(true);
    try {
      const [regs, mkt] = await Promise.all([getRegistries(), getMarketplace()]);
      setRegistries(regs);
      setEntries(mkt);
    } catch {
      toast.error(t('registry.toasts.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (e) =>
        e.friendlyName.toLowerCase().includes(q) ||
        e.name.toLowerCase().includes(q) ||
        (e.description ?? '').toLowerCase().includes(q) ||
        e.categories.some((c) => c.toLowerCase().includes(q)),
    );
  }, [entries, query]);

  const onAdd = async () => {
    if (!newUrl || !newName) return;
    try {
      await createRegistry({ name: newName, url: newUrl });
      setNewName('');
      setNewUrl('');
      toast.success(t('registry.toasts.added'));
      await refresh();
    } catch {
      toast.error(t('registry.toasts.addFailed'));
    }
  };

  const onSync = async (id: string) => {
    setBusyId(id);
    try {
      const res = await syncRegistry(id);
      toast.success(t('registry.toasts.synced', { count: res.upserted }));
      await refresh();
    } catch {
      toast.error(t('registry.toasts.syncFailed'));
    } finally {
      setBusyId(null);
    }
  };

  const onInstall = async (entry: ApiMarketplaceEntry) => {
    setBusyId(entry.id);
    try {
      await installMarketplaceEntry(entry.id, true);
      toast.success(t('registry.toasts.installedTitle', { name: entry.friendlyName }), {
        description: t('registry.toasts.installedDescription'),
      });
      await refresh();
    } catch {
      toast.error(t('registry.toasts.installFailed'));
    } finally {
      setBusyId(null);
    }
  };

  const onDelete = async (id: string) => {
    try {
      await deleteRegistry(id);
      toast.success(t('registry.toasts.removed'));
      await refresh();
    } catch {
      toast.error(t('registry.toasts.removeFailed'));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('registry.title')}
        description={t('registry.description')}
        actions={
          <Button variant="secondary" size="sm" onClick={() => void refresh()} disabled={!isLive || loading}>
            {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            {tc('actions.refresh')}
          </Button>
        }
      />

      {!isLive && (
        <Card elevation={1} className="p-4 text-sm text-muted-foreground">
          {t.rich('registry.liveOnly', {
            code: (chunks) => (
              <code className="rounded bg-anthracite-950/60 px-1.5 py-0.5 text-xs">{chunks}</code>
            ),
          })}
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label={t('registry.stats.registries')} value={registries.length} icon={Boxes} primary />
        <StatCard label={t('registry.stats.marketplaceApps')} value={entries.length} icon={Store} />
        <StatCard label={t('registry.stats.installed')} value={entries.filter((e) => e.installed).length} icon={Check} />
      </div>

      {/* Registries */}
      <Card elevation={1} className="overflow-hidden">
        <div className="flex flex-col gap-2 border-b border-border-subtle p-4 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="text-xs text-muted-foreground">{tc('labels.name')}</label>
            <Input placeholder={t('registry.form.namePlaceholder')} value={newName} onChange={(e) => setNewName(e.target.value)} />
          </div>
          <div className="flex-[2]">
            <label className="text-xs text-muted-foreground">{t('registry.form.urlLabel')}</label>
            <Input placeholder="https://registry.example.com/index.json" value={newUrl} onChange={(e) => setNewUrl(e.target.value)} />
          </div>
          <Button size="sm" onClick={() => void onAdd()} disabled={!isLive || !newUrl || !newName}>
            <Plus className="size-3.5" /> {tc('actions.add')}
          </Button>
        </div>
        <div className="divide-y divide-border-subtle/60">
          {registries.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">{t('registry.empty')}</p>
          ) : (
            registries.map((r) => (
              <div key={r.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <Boxes className="size-4 text-gold-300" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{r.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{r.url}</p>
                </div>
                <Badge variant={r.type === 'FIRST_PARTY' ? 'gold' : 'outline'}>{t(`registry.type.${r.type}`)}</Badge>
                <span className="hidden text-xs text-muted-foreground sm:inline">
                  {t('registry.appCount', { count: r._count?.entries ?? 0 })}
                </span>
                <Button variant="ghost" size="icon-sm" onClick={() => void onSync(r.id)} disabled={busyId === r.id}>
                  {busyId === r.id ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                </Button>
                <Button variant="ghost" size="icon-sm" onClick={() => void onDelete(r.id)}>
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            ))
          )}
        </div>
      </Card>

      {/* Marketplace */}
      <div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-display text-lg font-medium">{t('registry.marketplace.title')}</h2>
          <Input
            placeholder={t('registry.marketplace.searchPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="max-w-xs"
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((entry) => (
            <Card key={entry.id} elevation={1} className="flex flex-col gap-3 p-4">
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-gold-500/10 text-gold-300">
                  <Store className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-medium">{entry.friendlyName}</h3>
                  <p className="truncate font-mono text-[11px] text-muted-foreground">{entry.dockerImage}</p>
                </div>
              </div>
              <p className="line-clamp-2 min-h-[2.5rem] text-sm text-muted-foreground">
                {entry.description ?? t('registry.marketplace.noDescription')}
              </p>
              <div className="flex flex-wrap gap-1">
                {entry.categories.slice(0, 3).map((c) => (
                  <Badge key={c} variant="outline">
                    {c}
                  </Badge>
                ))}
              </div>
              <Button
                size="sm"
                variant={entry.installed ? 'secondary' : 'primary'}
                disabled={busyId === entry.id || entry.installed}
                onClick={() => void onInstall(entry)}
              >
                {busyId === entry.id ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : entry.installed ? (
                  <Check className="size-3.5" />
                ) : (
                  <Download className="size-3.5" />
                )}
                {entry.installed ? t('registry.marketplace.installed') : t('registry.marketplace.install')}
              </Button>
            </Card>
          ))}
          {filtered.length === 0 && (
            <p className="col-span-full py-8 text-center text-sm text-muted-foreground">
              {isLive ? t('registry.marketplace.emptyLive') : t('registry.marketplace.emptyMock')}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
