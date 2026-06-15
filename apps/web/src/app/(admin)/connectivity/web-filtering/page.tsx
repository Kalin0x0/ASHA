'use client';

import { Filter, Loader2, Plus, Trash2 } from 'lucide-react';
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
  type ApiWebFilter,
  createWebFilter,
  deleteWebFilter,
  getWebFilters,
  updateWebFilter,
} from '@/lib/api/endpoints';
import { isLive } from '@/lib/api/mode';

const CATEGORIES = ['ads', 'malware', 'adult', 'social', 'gambling', 'streaming', 'phishing'];

export default function WebFilteringPage() {
  const t = useTranslations('connectivity');
  const tc = useTranslations('common');
  const [filters, setFilters] = useState<ApiWebFilter[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [blocked, setBlocked] = useState<string[]>(['ads', 'malware', 'phishing']);
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    if (!isLive) return;
    setLoading(true);
    try {
      setFilters(await getWebFilters());
    } catch {
      toast.error(t('webFiltering.toasts.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const toggleCat = (c: string) =>
    setBlocked((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]));

  const onCreate = async () => {
    if (!name) return;
    setCreating(true);
    try {
      const categories = Object.fromEntries(blocked.map((c) => [c, true]));
      await createWebFilter({ name, categories, enabled: false });
      toast.success(t('webFiltering.toasts.created'), { description: t('webFiltering.toasts.createdDescription') });
      setName('');
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('webFiltering.toasts.createFailed'));
    } finally {
      setCreating(false);
    }
  };

  const onToggle = async (f: ApiWebFilter) => {
    setBusyId(f.id);
    try {
      await updateWebFilter(f.id, { enabled: !f.enabled });
      await refresh();
    } catch {
      toast.error(t('webFiltering.toasts.updateFailed'));
    } finally {
      setBusyId(null);
    }
  };

  const onDelete = async (id: string) => {
    setBusyId(id);
    try {
      await deleteWebFilter(id);
      toast.success(t('webFiltering.toasts.removed'));
      await refresh();
    } catch {
      toast.error(t('webFiltering.toasts.removeFailed'));
    } finally {
      setBusyId(null);
    }
  };

  const blockedCount = (f: ApiWebFilter) =>
    Object.values(f.categories ?? {}).filter(Boolean).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('webFiltering.title')}
        description={t('webFiltering.description')}
      />

      {!isLive && (
        <Card elevation={1} className="p-4 text-sm text-muted-foreground">
          {t.rich('webFiltering.liveOnly', {
            code: (chunks) => (
              <code className="rounded bg-anthracite-950/60 px-1.5 py-0.5 text-xs">{chunks}</code>
            ),
          })}
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label={t('webFiltering.stats.policies')} value={filters.length} icon={Filter} primary />
        <StatCard label={tc('labels.enabled')} value={filters.filter((f) => f.enabled).length} icon={Filter} />
      </div>

      <Card elevation={1} className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border-subtle p-4">
          <h2 className="font-display text-lg font-medium">{t('webFiltering.policiesTitle')}</h2>
          {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        </div>
        <div className="divide-y divide-border-subtle/60">
          {filters.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">{t('webFiltering.empty')}</p>
          ) : (
            filters.map((f) => (
              <div key={f.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <Filter className="size-4 text-gold-300" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{f.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{t('webFiltering.policyMeta', { count: blockedCount(f), ttl: f.cacheTtl })}</p>
                </div>
                <Badge variant={f.enabled ? 'success' : 'outline'}>{f.enabled ? tc('labels.enabled') : tc('labels.disabled')}</Badge>
                <Button variant="secondary" size="sm" disabled={busyId === f.id} onClick={() => void onToggle(f)}>
                  {f.enabled ? tc('actions.disable') : tc('actions.enable')}
                </Button>
                <Button variant="ghost" size="icon-sm" disabled={busyId === f.id} onClick={() => void onDelete(f.id)}>
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            ))
          )}
        </div>
      </Card>

      <Card elevation={1} className="space-y-4 p-5">
        <h2 className="font-display text-lg font-medium">{t('webFiltering.addTitle')}</h2>
        <div>
          <Label>{tc('labels.name')}</Label>
          <Input placeholder="default-filter" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label className="mb-1.5">{t('webFiltering.form.blockedCategories')}</Label>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => toggleCat(c)}
                className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                  blocked.includes(c)
                    ? 'border-[rgba(212,175,55,0.4)] bg-gold-500/10 text-gold-300'
                    : 'border-border-subtle text-muted-foreground hover:bg-secondary'
                }`}
              >
                {t(`webFiltering.categories.${c}`)}
              </button>
            ))}
          </div>
        </div>
        <Button size="sm" onClick={() => void onCreate()} disabled={!isLive || !name || creating}>
          {creating ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
          {t('webFiltering.addButton')}
        </Button>
      </Card>
    </div>
  );
}
