'use client';

import { Gauge, Loader2, Network, Plus, Settings2, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/composite/page-header';
import { StatCard } from '@/components/composite/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
      toast.error('Failed to load pools');
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
      toast.success('Pool created');
      setName('');
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not create pool');
    } finally {
      setCreating(false);
    }
  };

  const onDelete = async (id: string) => {
    setBusyId(id);
    try {
      await deletePool(id);
      toast.success('Pool removed');
      await refresh();
    } catch {
      toast.error('Could not remove pool');
    } finally {
      setBusyId(null);
    }
  };

  const onToggleAutoscale = async (p: ApiServerPool) => {
    setBusyId(p.id);
    try {
      if (p.autoscaleConfig) {
        await disableAutoscale(p.id);
        toast.success('Autoscale disabled');
      } else {
        await upsertAutoscale(p.id, { mode: 'LOAD', minStandby: 1, maxInstances: 5, perServerSessionLimit: 4 });
        toast.success('Autoscale enabled');
      }
      await refresh();
    } catch {
      toast.error('Could not update autoscale');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Server Pools"
        description="Group agents or servers into pools that can be autoscaled. Each pool may have an autoscale policy that grows/shrinks capacity."
      />

      {!isLive && (
        <Card elevation={1} className="p-4 text-sm text-muted-foreground">
          Pool management is live-backend only. Run with{' '}
          <code className="rounded bg-anthracite-950/60 px-1.5 py-0.5 text-xs">NEXT_PUBLIC_API_MODE=live</code>.
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Pools" value={pools.length} icon={Network} primary />
        <StatCard label="Autoscaled" value={pools.filter((p) => p.autoscaleConfig).length} icon={Gauge} />
        <StatCard label="Members" value={pools.reduce((a, p) => a + (p._count?.members ?? 0), 0)} icon={Network} />
      </div>

      <Card elevation={1} className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border-subtle p-4">
          <h2 className="font-display text-lg font-medium">Pools</h2>
          {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        </div>
        <div className="divide-y divide-border-subtle/60">
          {pools.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">No pools configured yet.</p>
          ) : (
            pools.map((p) => (
              <div key={p.id}>
                <div className="flex items-center gap-3 px-5 py-3 text-sm">
                  <Network className="size-4 text-gold-300" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{p.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{p._count?.members ?? 0} member(s)</p>
                  </div>
                  <Badge variant="outline">{p.kind}</Badge>
                  {p.autoscaleConfig ? (
                    <Badge variant="gold">Autoscale: {p.autoscaleConfig.mode}</Badge>
                  ) : (
                    <Badge variant="outline">Manual</Badge>
                  )}
                  {p.autoscaleConfig && (
                    <Button variant="ghost" size="icon-sm" title="Edit autoscale" onClick={() => setEditing(editing === p.id ? null : p.id)}>
                      <Settings2 className={`size-4 ${editing === p.id ? 'text-gold-300' : ''}`} />
                    </Button>
                  )}
                  <Button variant="secondary" size="sm" disabled={busyId === p.id} onClick={() => void onToggleAutoscale(p)}>
                    {p.autoscaleConfig ? 'Disable AS' : 'Enable AS'}
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
        <h2 className="font-display text-lg font-medium">Add pool</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label>Name</Label>
            <Input placeholder="gpu-render-pool" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>Kind</Label>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as 'AGENT' | 'SERVER')}
              className="h-9 w-full rounded-md border border-border-subtle bg-[var(--surface-1)] px-2 text-sm"
            >
              <option value="AGENT">Agent (container hosts)</option>
              <option value="SERVER">Server (RDP/VNC hosts)</option>
            </select>
          </div>
        </div>
        <Button size="sm" onClick={() => void onCreate()} disabled={!isLive || !name || creating}>
          {creating ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
          Add pool
        </Button>
      </Card>
    </div>
  );
}

function AutoscaleEditor({ pool, onSaved }: { pool: ApiServerPool; onSaved: () => void }) {
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
      toast.success('Autoscale updated');
      onSaved();
    } catch {
      toast.error('Could not save autoscale');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <Label className="text-xs">Mode</Label>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as typeof mode)}
            className="h-9 w-full rounded-md border border-border-subtle bg-[var(--surface-1)] px-2 text-sm"
          >
            <option value="LOAD">Load</option>
            <option value="SCHEDULE">Schedule</option>
            <option value="ACTIVE_DIRECTORY">Active Directory</option>
          </select>
        </div>
        <div>
          <Label className="text-xs">Min standby</Label>
          <Input type="number" min={0} value={minStandby} onChange={(e) => setMinStandby(Number(e.target.value))} />
        </div>
        <div>
          <Label className="text-xs">Max instances</Label>
          <Input type="number" min={1} value={maxInstances} onChange={(e) => setMaxInstances(Number(e.target.value))} />
        </div>
        <div>
          <Label className="text-xs">Per-server limit</Label>
          <Input type="number" min={1} value={perServer} onChange={(e) => setPerServer(Number(e.target.value))} />
        </div>
      </div>
      <Button size="sm" onClick={() => void save()} disabled={saving}>
        {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Gauge className="size-3.5" />}
        Save policy
      </Button>
    </div>
  );
}
