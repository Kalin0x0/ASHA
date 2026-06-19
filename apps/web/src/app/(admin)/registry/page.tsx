'use client';

import {
  BadgeCheck,
  Boxes,
  Check,
  Download,
  HardDrive,
  Loader2,
  Plus,
  RefreshCw,
  Store,
  Trash2,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AppIcon } from '@/components/composite/app-icon';
import { PageHeader } from '@/components/composite/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { ApiMarketplaceEntry } from '@/lib/api/endpoints';
import {
  useAddRegistry,
  useDeleteRegistry,
  useInstallEntry,
  useMarketplace,
  useRegistries,
  useReinstallEntry,
  useSyncRegistry,
  useUninstallEntry,
} from '@/lib/hooks';
import { cn, formatRelativeTime } from '@/lib/utils';

type Tab = 'available' | 'installed' | 'registries';

function gib(sizeMb?: number): string {
  if (!sizeMb) return '—';
  return `${(sizeMb / 1024).toFixed(1)} GiB`;
}

export default function RegistryPage() {
  const t = useTranslations('workspaces.registry');
  const tc = useTranslations('common');
  const registries = useRegistries();
  const marketplace = useMarketplace();
  const addRegistry = useAddRegistry();
  const deleteRegistry = useDeleteRegistry();
  const syncRegistry = useSyncRegistry();
  const installEntry = useInstallEntry();
  const reinstallEntry = useReinstallEntry();
  const uninstallEntry = useUninstallEntry();

  const [tab, setTab] = useState<Tab>('available');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [adding, setAdding] = useState(false);

  const installedCount = useMemo(() => marketplace.filter((m) => m.installed).length, [marketplace]);
  const totalSizeGib = useMemo(
    () => marketplace.reduce((sum, m) => sum + (m.sizeMb ?? 0), 0) / 1024,
    [marketplace],
  );

  const categories = useMemo(
    () => ['All', ...Array.from(new Set(marketplace.flatMap((m) => m.categories))).sort((a, b) => a.localeCompare(b))],
    [marketplace],
  );

  const visible = useMemo(() => {
    const base = tab === 'installed' ? marketplace.filter((m) => m.installed) : marketplace;
    const q = query.trim().toLowerCase();
    return base.filter((e) => {
      if (category !== 'All' && !e.categories.includes(category)) return false;
      if (!q) return true;
      return (
        e.friendlyName.toLowerCase().includes(q) ||
        e.dockerImage.toLowerCase().includes(q) ||
        (e.description ?? '').toLowerCase().includes(q) ||
        e.categories.some((c) => c.toLowerCase().includes(q))
      );
    });
  }, [marketplace, tab, query, category]);

  const onInstall = async (entry: ApiMarketplaceEntry) => {
    setBusyId(entry.id);
    setProgress((p) => ({ ...p, [entry.id]: 8 }));
    // Animate progress while the install registers the image (the heavy image
    // pull happens on first launch); snap to 100% → green when it completes.
    const timer = setInterval(() => {
      setProgress((p) => {
        const cur = p[entry.id] ?? 0;
        return cur >= 92 ? p : { ...p, [entry.id]: Math.min(92, cur + Math.random() * 16 + 5) };
      });
    }, 220);
    try {
      await installEntry(entry.id);
      setProgress((p) => ({ ...p, [entry.id]: 100 }));
      toast.success(t('toasts.installedTitle', { name: entry.friendlyName }), {
        description: t('toasts.installedDescription'),
      });
      setTimeout(() => setProgress((p) => { const n = { ...p }; delete n[entry.id]; return n; }), 1200);
    } catch {
      toast.error(t('toasts.installFailed'));
      setProgress((p) => { const n = { ...p }; delete n[entry.id]; return n; });
    } finally {
      clearInterval(timer);
      setBusyId(null);
    }
  };

  const onReinstall = async (entry: ApiMarketplaceEntry) => {
    setBusyId(entry.id);
    try {
      await reinstallEntry(entry.id);
      toast.success(t('toasts.reinstalledTitle', { name: entry.friendlyName }), {
        description: t('toasts.reinstalledDescription'),
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('toasts.reinstallFailed'));
    } finally {
      setBusyId(null);
    }
  };

  const onRemove = async (entry: ApiMarketplaceEntry) => {
    setBusyId(entry.id);
    try {
      const res = await uninstallEntry(entry.id);
      toast.success(
        res.hostImageRemoved
          ? t('toasts.imageRemovedDisk', { name: entry.friendlyName })
          : t('toasts.imageRemovedShared', { name: entry.friendlyName }),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('toasts.imageRemoveFailed'));
    } finally {
      setBusyId(null);
    }
  };

  const onSync = async (id: string) => {
    setBusyId(id);
    try {
      const res = await syncRegistry(id);
      toast.success(t('toasts.synced', { count: res.upserted }));
    } catch {
      toast.error(t('toasts.syncFailed'));
    } finally {
      setBusyId(null);
    }
  };

  const onAdd = async () => {
    if (!newName.trim() || !newUrl.trim()) return;
    setAdding(true);
    try {
      await addRegistry({ name: newName.trim(), url: newUrl.trim() });
      setNewName('');
      setNewUrl('');
      toast.success(t('toasts.added'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('toasts.addFailed'));
    } finally {
      setAdding(false);
    }
  };

  const onDelete = async (id: string) => {
    try {
      await deleteRegistry(id);
      toast.success(t('toasts.removed'));
    } catch {
      toast.error(t('toasts.removeFailed'));
    }
  };

  const tabs: Array<{ key: Tab; label: string; count: number }> = [
    { key: 'available', label: t('tabs.available'), count: marketplace.length },
    { key: 'installed', label: t('tabs.installed'), count: installedCount },
    { key: 'registries', label: t('tabs.registries'), count: registries.length },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('description')} />

      {/* Summary strip */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-border-subtle bg-[var(--surface-1)]/60 px-5 py-3 text-sm">
        <Metric icon={Store} label={t('stats.available')} value={String(marketplace.length)} />
        <Metric icon={Check} label={t('stats.installed')} value={String(installedCount)} />
        <Metric icon={Boxes} label={t('stats.registries')} value={String(registries.length)} />
        <Metric icon={HardDrive} label={t('stats.catalogSize')} value={`${totalSizeGib.toFixed(1)} GiB`} />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border-subtle">
        {tabs.map((tb) => (
          <button
            key={tb.key}
            onClick={() => setTab(tb.key)}
            className={cn(
              'relative -mb-px border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors ring-gold-focus',
              tab === tb.key
                ? 'border-gold-400 text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {tb.label}
            <span className={cn('ms-1.5 text-xs', tab === tb.key ? 'text-gold-300' : 'text-muted-foreground/60')}>
              {tb.count}
            </span>
          </button>
        ))}
      </div>

      {tab === 'registries' ? (
        <RegistriesPanel
          registries={registries}
          busyId={busyId}
          newName={newName}
          newUrl={newUrl}
          adding={adding}
          setNewName={setNewName}
          setNewUrl={setNewUrl}
          onAdd={onAdd}
          onSync={onSync}
          onDelete={onDelete}
        />
      ) : (
        <>
          {/* Search + categories */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Input
              placeholder={t('marketplace.searchPlaceholder')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="sm:max-w-xs"
            />
            <div className="flex flex-wrap gap-1.5">
              {categories.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs font-medium transition-colors ring-gold-focus',
                    category === c
                      ? 'border-[rgba(212,175,55,0.4)] bg-gold-500/10 text-gold-300'
                      : 'border-border-subtle text-muted-foreground hover:text-foreground',
                  )}
                >
                  {c === 'All' ? t('allCategories') : c}
                </button>
              ))}
            </div>
          </div>

          {visible.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              {tab === 'installed' ? t('installedEmpty') : t('availableEmpty')}
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visible.map((entry) => (
                <ImageCard
                  key={entry.id}
                  entry={entry}
                  busy={busyId === entry.id}
                  progress={progress[entry.id]}
                  onInstall={() => void onInstall(entry)}
                  onReinstall={() => void onReinstall(entry)}
                  onRemove={() => void onRemove(entry)}
                  installLabel={t('marketplace.install')}
                  installedLabel={t('marketplace.installed')}
                  reinstallLabel={t('marketplace.reinstall')}
                  removeLabel={t('marketplace.remove')}
                  sourceLabel={t('card.source')}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Store; label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <Icon className="size-4 text-gold-300" />
      <span className="font-semibold text-foreground">{value}</span>
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}

function ImageCard({
  entry,
  busy,
  progress,
  onInstall,
  onReinstall,
  onRemove,
  installLabel,
  installedLabel,
  reinstallLabel,
  removeLabel,
  sourceLabel,
}: {
  entry: ApiMarketplaceEntry;
  busy: boolean;
  progress?: number;
  onInstall: () => void;
  onReinstall: () => void;
  onRemove: () => void;
  installLabel: string;
  installedLabel: string;
  reinstallLabel: string;
  removeLabel: string;
  sourceLabel: string;
}) {
  const firstParty = entry.registry?.type === 'FIRST_PARTY';
  return (
    <Card elevation={1} className="flex flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        <AppIcon
          name={entry.friendlyName}
          dockerImage={entry.dockerImage}
          category={entry.categories[0]}
          iconUrl={entry.iconUrl ?? undefined}
          rounded="rounded-xl"
          className="size-11 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-medium leading-tight">{entry.friendlyName}</h3>
          {entry.registry && (
            <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-muted-foreground" title={sourceLabel}>
              {firstParty && <BadgeCheck className="size-3 shrink-0 text-gold-300" />}
              {entry.registry.name}
            </p>
          )}
        </div>
        <Badge variant="outline" className="shrink-0 font-mono text-[10px]">
          {gib(entry.sizeMb)}
        </Badge>
      </div>

      <p className="line-clamp-2 min-h-[2.5rem] text-[13px] text-muted-foreground">{entry.description}</p>

      <div className="flex flex-wrap gap-1">
        {entry.categories.slice(0, 3).map((c) => (
          <Badge key={c} variant="outline" className="text-[10px]">
            {c}
          </Badge>
        ))}
      </div>

      {progress != null && !entry.installed ? (
        <div className="mt-auto">
          <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{installLabel}…</span>
            <span className="tnum font-medium text-gold-300">{Math.round(progress)}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-anthracite-950/60">
            <div
              className="h-full rounded-full bg-gradient-to-r from-gold-500 to-gold-300 transition-[width] duration-200 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      ) : entry.installed ? (
        <div className="mt-auto flex items-center gap-2">
          <span className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-success/40 px-2.5 py-1.5 text-xs font-medium text-success">
            <Check className="size-3.5" />
            {installedLabel}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={reinstallLabel}
            title={reinstallLabel}
            disabled={busy}
            onClick={onReinstall}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={removeLabel}
            title={removeLabel}
            disabled={busy}
            onClick={onRemove}
          >
            <Trash2 className="size-4 text-destructive" />
          </Button>
        </div>
      ) : (
        <Button size="sm" variant="primary" disabled={busy} onClick={onInstall} className="mt-auto">
          <Download className="size-3.5" />
          {installLabel}
        </Button>
      )}
    </Card>
  );
}

function RegistriesPanel({
  registries,
  busyId,
  newName,
  newUrl,
  adding,
  setNewName,
  setNewUrl,
  onAdd,
  onSync,
  onDelete,
}: {
  registries: ReturnType<typeof useRegistries>;
  busyId: string | null;
  newName: string;
  newUrl: string;
  adding: boolean;
  setNewName: (v: string) => void;
  setNewUrl: (v: string) => void;
  onAdd: () => void;
  onSync: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const t = useTranslations('workspaces.registry');
  const tc = useTranslations('common');
  return (
    <Card elevation={1} className="overflow-hidden">
      <div className="border-b border-border-subtle p-4">
        <p className="mb-2 text-sm font-medium">{t('sources.addTitle')}</p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="text-xs text-muted-foreground">{tc('labels.name')}</label>
            <Input placeholder={t('form.namePlaceholder')} value={newName} onChange={(e) => setNewName(e.target.value)} />
          </div>
          <div className="flex-[2]">
            <label className="text-xs text-muted-foreground">{t('form.urlLabel')}</label>
            <Input dir="ltr" placeholder="https://registry.example.com/index.json" value={newUrl} onChange={(e) => setNewUrl(e.target.value)} />
          </div>
          <Button size="sm" onClick={onAdd} disabled={adding || !newName.trim() || !newUrl.trim()}>
            {adding ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
            {tc('actions.add')}
          </Button>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">{t('sources.addHint')}</p>
      </div>
      <div className="divide-y divide-border-subtle/60">
        {registries.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">{t('empty')}</p>
        ) : (
          registries.map((r) => (
            <div key={r.id} className="flex items-center gap-3 px-5 py-3.5 text-sm">
              <Boxes className="size-4 shrink-0 text-gold-300" />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate font-medium">
                  {r.name}
                  {r.type === 'FIRST_PARTY' && <BadgeCheck className="size-3.5 text-gold-300" />}
                </p>
                <p dir="ltr" className="truncate text-xs text-muted-foreground">{r.url}</p>
              </div>
              <span className="hidden text-xs text-muted-foreground md:inline">
                {t('appCount', { count: r._count?.entries ?? 0 })}
              </span>
              <span className="hidden text-[11px] text-muted-foreground/70 lg:inline">
                {r.lastSyncedAt ? t('sources.syncedAt', { time: formatRelativeTime(r.lastSyncedAt) }) : t('sources.never')}
              </span>
              <Button variant="ghost" size="icon-sm" aria-label={tc('actions.refresh')} onClick={() => onSync(r.id)} disabled={busyId === r.id}>
                {busyId === r.id ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label={tc('actions.remove')} onClick={() => onDelete(r.id)}>
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
