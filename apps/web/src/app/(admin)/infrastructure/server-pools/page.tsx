'use client';

import { Gauge, Loader2, Network, Plus, Settings2, Trash2 } from 'lucide-react';
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
  type ApiServerPool,
  createPool,
  deletePool,
  disableAutoscale,
  getPools,
  upsertAutoscale,
} from '@/lib/api/endpoints';
import { isLive } from '@/lib/api/mode';

export default function ServerPoolsPage() {
  const t = useTranslations('infrastructure');
  const tc = useTranslations('common');
  const confirm = useConfirm();
  const [pools, setPools] = useState<ApiServerPool[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'AGENT' | 'SERVER'>('AGENT');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!isLive) return;
    setLoading(true);
    try {
      setPools(await getPools());
    } catch {
      toast.error(t('serverPools.toasts.loadFailed'));
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
      await createPool({ name, kind, enabled: true });
      toast.success(t('serverPools.toasts.created'));
      setName('');
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('serverPools.toasts.createFailed'));
    } finally {
      setCreating(false);
    }
  };

  const onDelete = async (id: string) => {
    const pool = pools.find((p) => p.id === id);
    if (!(await confirm({ title: tc('confirm.deleteNamed', { name: pool?.name ?? '' }) }))) return;
    setBusyId(id);
    try {
      await deletePool(id);
      toast.success(t('serverPools.toasts.removed'));
      await refresh();
    } catch {
      toast.error(t('serverPools.toasts.removeFailed'));
    } finally {
      setBusyId(null);
    }
  };

  const onToggleAutoscale = async (p: ApiServerPool) => {
    setBusyId(p.id);
    try {
      if (p.autoscaleConfig) {
        await disableAutoscale(p.id);
        toast.success(t('serverPools.toasts.autoscaleDisabled'));
      } else {
        await upsertAutoscale(p.id, { mode: 'LOAD', minStandby: 1, maxInstances: 5, perServerSessionLimit: 4 });
        toast.success(t('serverPools.toasts.autoscaleEnabled'));
      }
      await refresh();
    } catch {
      toast.error(t('serverPools.toasts.autoscaleUpdateFailed'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('serverPools.title')}
        description={t('serverPools.description')}
      />

      {!isLive && (
        <Card elevation={1} className="p-4 text-sm text-muted-foreground">
          {t.rich('serverPools.liveOnly', {
            code: (chunks) => (
              <code className="rounded bg-anthracite-950/60 px-1.5 py-0.5 text-xs">{chunks}</code>
            ),
          })}
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label={t('serverPools.stats.pools')} value={pools.length} icon={Network} primary />
        <StatCard label={t('serverPools.stats.autoscaled')} value={pools.filter((p) => p.autoscaleConfig).length} icon={Gauge} />
        <StatCard label={t('serverPools.stats.members')} value={pools.reduce((a, p) => a + (p._count?.members ?? 0), 0)} icon={Network} />
      </div>

      <Card elevation={1} className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border-subtle p-4">
          <h2 className="font-display text-lg font-medium">{t('serverPools.poolsTitle')}</h2>
          {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        </div>
        <div className="divide-y divide-border-subtle/60">
          {pools.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">{t('serverPools.empty')}</p>
          ) : (
            pools.map((p) => (
              <div key={p.id}>
                <div className="flex items-center gap-3 px-5 py-3 text-sm">
                  <Network className="size-4 text-gold-300" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{p.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{t('serverPools.memberCount', { count: p._count?.members ?? 0 })}</p>
                  </div>
                  <Badge variant="outline">{t(`serverPools.kinds.${p.kind}`)}</Badge>
                  {p.autoscaleConfig ? (
                    <Badge variant="gold">{t('serverPools.autoscaleBadge', { mode: t(`serverPools.modes.${p.autoscaleConfig.mode}`) })}</Badge>
                  ) : (
                    <Badge variant="outline">{t('serverPools.manual')}</Badge>
                  )}
                  {p.autoscaleConfig && (
                    <Button variant="ghost" size="icon-sm" title={t('serverPools.editAutoscale')} onClick={() => setEditing(editing === p.id ? null : p.id)}>
                      <Settings2 className={`size-4 ${editing === p.id ? 'text-gold-300' : ''}`} />
                    </Button>
                  )}
                  <Button variant="secondary" size="sm" disabled={busyId === p.id} onClick={() => void onToggleAutoscale(p)}>
                    {p.autoscaleConfig ? t('serverPools.disableAs') : t('serverPools.enableAs')}
                  </Button>
                  <Button variant="ghost" size="icon-sm" disabled={busyId === p.id} onClick={() => void onDelete(p.id)}>
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
                {editing === p.id && p.autoscaleConfig && (
                  <div className="border-t border-border-subtle/60 bg-anthracite-950/30 px-5 py-4">
                    <AutoscaleEditor pool={p} onSaved={() => void refresh()} />
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </Card>

      <Card elevation={1} className="space-y-4 p-5">
        <h2 className="font-display text-lg font-medium">{t('serverPools.addPool')}</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label>{tc('labels.name')}</Label>
            <Input placeholder="gpu-render-pool" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>{t('serverPools.form.kind')}</Label>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as 'AGENT' | 'SERVER')}
              className="h-9 w-full rounded-md border border-border-subtle bg-[var(--surface-1)] px-2 text-sm"
            >
              <option value="AGENT">{t('serverPools.form.kindAgent')}</option>
              <option value="SERVER">{t('serverPools.form.kindServer')}</option>
            </select>
          </div>
        </div>
        <Button size="sm" onClick={() => void onCreate()} disabled={!isLive || !name || creating}>
          {creating ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
          {t('serverPools.addPool')}
        </Button>
      </Card>
    </div>
  );
}

function AutoscaleEditor({ pool, onSaved }: { pool: ApiServerPool; onSaved: () => void }) {
  const t = useTranslations('infrastructure');
  const cfg = pool.autoscaleConfig!;
  const [mode, setMode] = useState(cfg.mode);
  const [minStandby, setMinStandby] = useState(cfg.minStandby);
  const [maxInstances, setMaxInstances] = useState(cfg.maxInstances);
  const [perServer, setPerServer] = useState(cfg.perServerSessionLimit);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await upsertAutoscale(pool.id, {
        mode,
        minStandby,
        maxInstances,
        perServerSessionLimit: perServer,
      });
      toast.success(t('serverPools.toasts.autoscaleUpdated'));
      onSaved();
    } catch {
      toast.error(t('serverPools.toasts.autoscaleSaveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <Label className="text-xs">{t('serverPools.editor.mode')}</Label>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as typeof mode)}
            className="h-9 w-full rounded-md border border-border-subtle bg-[var(--surface-1)] px-2 text-sm"
          >
            <option value="LOAD">{t('serverPools.modes.LOAD')}</option>
            <option value="SCHEDULE">{t('serverPools.modes.SCHEDULE')}</option>
            <option value="ACTIVE_DIRECTORY">{t('serverPools.modes.ACTIVE_DIRECTORY')}</option>
          </select>
        </div>
        <div>
          <Label className="text-xs">{t('serverPools.editor.minStandby')}</Label>
          <Input type="number" min={0} value={minStandby} onChange={(e) => setMinStandby(Number(e.target.value))} />
        </div>
        <div>
          <Label className="text-xs">{t('serverPools.editor.maxInstances')}</Label>
          <Input type="number" min={1} value={maxInstances} onChange={(e) => setMaxInstances(Number(e.target.value))} />
        </div>
        <div>
          <Label className="text-xs">{t('serverPools.editor.perServerLimit')}</Label>
          <Input type="number" min={1} value={perServer} onChange={(e) => setPerServer(Number(e.target.value))} />
        </div>
      </div>
      <Button size="sm" onClick={() => void save()} disabled={saving}>
        {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Gauge className="size-3.5" />}
        {t('serverPools.editor.savePolicy')}
      </Button>
    </div>
  );
}
