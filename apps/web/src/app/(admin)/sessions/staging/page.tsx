'use client';

import { Layers, Loader2, Minus, Plus, Trash2 } from 'lucide-react';
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
  type ApiStaging,
  type ApiWorkspace,
  type ApiZone,
  createStaging,
  deleteStaging,
  getStaging,
  getWorkspaces,
  getZones,
  updateStaging,
} from '@/lib/api/endpoints';
import { isLive } from '@/lib/api/mode';

export default function StagingPage() {
  const t = useTranslations('sessions');
  const tc = useTranslations('common');
  const confirm = useConfirm();
  const [staging, setStaging] = useState<ApiStaging[]>([]);
  const [workspaces, setWorkspaces] = useState<ApiWorkspace[]>([]);
  const [zones, setZones] = useState<ApiZone[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState('');
  const [zoneId, setZoneId] = useState('');
  const [desired, setDesired] = useState(1);
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    if (!isLive) return;
    setLoading(true);
    try {
      const [st, ws, zs] = await Promise.all([getStaging(), getWorkspaces(), getZones()]);
      setStaging(st);
      setWorkspaces(ws);
      setZones(zs);
      if (!workspaceId && ws.length > 0) setWorkspaceId(ws[0]!.id);
      if (!zoneId && zs.length > 0) setZoneId(zs[0]!.id);
    } catch {
      toast.error(t('staging.toastLoadFailed'));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onCreate = async () => {
    if (!workspaceId || !zoneId) return;
    setCreating(true);
    try {
      await createStaging({ workspaceId, zoneId, desiredSessions: desired, enabled: true });
      toast.success(t('staging.toastCreated'));
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('staging.toastCreateFailed'));
    } finally {
      setCreating(false);
    }
  };

  const onAdjust = async (s: ApiStaging, delta: number) => {
    setBusyId(s.id);
    try {
      await updateStaging(s.id, { desiredSessions: Math.max(0, s.desiredSessions + delta) });
      await refresh();
    } catch {
      toast.error(t('staging.toastAdjustFailed'));
    } finally {
      setBusyId(null);
    }
  };

  const onToggle = async (s: ApiStaging) => {
    setBusyId(s.id);
    try {
      await updateStaging(s.id, { enabled: !s.enabled });
      await refresh();
    } catch {
      toast.error(t('staging.toastUpdateFailed'));
    } finally {
      setBusyId(null);
    }
  };

  const onDelete = async (id: string) => {
    const pool = staging.find((s) => s.id === id);
    if (!(await confirm({ title: tc('confirm.deleteNamed', { name: pool ? wsName(pool) : '' }) }))) return;
    setBusyId(id);
    try {
      await deleteStaging(id);
      toast.success(t('staging.toastRemoved'));
      await refresh();
    } catch {
      toast.error(t('staging.toastRemoveFailed'));
    } finally {
      setBusyId(null);
    }
  };

  const wsName = (s: ApiStaging) => s.workspace?.friendlyName || s.workspace?.name || s.workspaceId;
  const zoneName = (id: string) => zones.find((z) => z.id === id)?.name ?? id;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('staging.title')}
        description={t('staging.description')}
      />

      {!isLive && (
        <Card elevation={1} className="p-4 text-sm text-muted-foreground">
          {t.rich('staging.liveOnly', {
            code: (chunks) => (
              <code className="rounded bg-anthracite-950/60 px-1.5 py-0.5 text-xs">{chunks}</code>
            ),
          })}
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label={t('staging.stats.pools')} value={staging.length} icon={Layers} primary />
        <StatCard label={t('staging.stats.preWarmed')} value={staging.reduce((a, s) => a + s.desiredSessions, 0)} icon={Layers} />
      </div>

      <Card elevation={1} className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border-subtle p-4">
          <h2 className="font-display text-lg font-medium">{t('staging.poolsTitle')}</h2>
          {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        </div>
        <div className="divide-y divide-border-subtle/60">
          {staging.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">{t('staging.empty')}</p>
          ) : (
            staging.map((s) => (
              <div key={s.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <Layers className="size-4 text-gold-300" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{wsName(s)}</p>
                  <p className="truncate text-xs text-muted-foreground">{zoneName(s.zoneId)}</p>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon-sm" disabled={busyId === s.id} onClick={() => void onAdjust(s, -1)}>
                    <Minus className="size-4" />
                  </Button>
                  <span className="w-8 text-center font-medium tnum">{s.desiredSessions}</span>
                  <Button variant="ghost" size="icon-sm" disabled={busyId === s.id} onClick={() => void onAdjust(s, 1)}>
                    <Plus className="size-4" />
                  </Button>
                </div>
                <Badge variant={s.enabled ? 'success' : 'outline'}>{s.enabled ? tc('labels.active') : t('staging.paused')}</Badge>
                <Button variant="secondary" size="sm" disabled={busyId === s.id} onClick={() => void onToggle(s)}>
                  {s.enabled ? t('staging.pause') : t('staging.resume')}
                </Button>
                <Button variant="ghost" size="icon-sm" disabled={busyId === s.id} onClick={() => void onDelete(s.id)}>
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            ))
          )}
        </div>
      </Card>

      <Card elevation={1} className="space-y-4 p-5">
        <h2 className="font-display text-lg font-medium">{t('staging.addTitle')}</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <Label>{t('staging.workspace')}</Label>
            <select
              value={workspaceId}
              onChange={(e) => setWorkspaceId(e.target.value)}
              className="h-9 w-full rounded-md border border-border-subtle bg-[var(--surface-1)] px-2 text-sm"
            >
              {workspaces.length === 0 && <option value="">{t('staging.noWorkspaces')}</option>}
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.friendlyName || w.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>{t('staging.zone')}</Label>
            <select
              value={zoneId}
              onChange={(e) => setZoneId(e.target.value)}
              className="h-9 w-full rounded-md border border-border-subtle bg-[var(--surface-1)] px-2 text-sm"
            >
              {zones.length === 0 && <option value="">{t('staging.noZones')}</option>}
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>{t('staging.desiredSessions')}</Label>
            <Input type="number" min={0} value={desired} onChange={(e) => setDesired(Number(e.target.value))} />
          </div>
        </div>
        <Button size="sm" onClick={() => void onCreate()} disabled={!isLive || !workspaceId || !zoneId || creating}>
          {creating ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
          {t('staging.addPool')}
        </Button>
      </Card>
    </div>
  );
}
