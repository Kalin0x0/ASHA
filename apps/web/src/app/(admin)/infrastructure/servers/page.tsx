'use client';

import { HardDrive, Loader2, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/composite/page-header';
import { StatCard } from '@/components/composite/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import {
  type ApiServer,
  type ApiZone,
  createServer,
  deleteServer,
  getServers,
  getZones,
} from '@/lib/api/endpoints';
import { isLive } from '@/lib/api/mode';

const CONNECTION_TYPES = ['RDP', 'VNC', 'SSH'] as const;

export default function ServersPage() {
  const [servers, setServers] = useState<ApiServer[]>([]);
  const [zones, setZones] = useState<ApiZone[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [zoneId, setZoneId] = useState('');
  const [hostname, setHostname] = useState('');
  const [address, setAddress] = useState('');
  const [connectionType, setConnectionType] = useState<(typeof CONNECTION_TYPES)[number]>('RDP');
  const [maxSessions, setMaxSessions] = useState(1);
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    if (!isLive) return;
    setLoading(true);
    try {
      const [s, z] = await Promise.all([getServers(), getZones()]);
      setServers(s);
      setZones(z);
      if (!zoneId && z.length > 0) setZoneId(z[0]!.id);
    } catch {
      toast.error('Failed to load servers');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onCreate = async () => {
    if (!zoneId || !hostname || !address) return;
    setCreating(true);
    try {
      await createServer({ zoneId, hostname, address, connectionType, maxSessions });
      toast.success('Server added');
      setHostname('');
      setAddress('');
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not add server');
    } finally {
      setCreating(false);
    }
  };

  const onDelete = async (id: string) => {
    setBusyId(id);
    try {
      await deleteServer(id);
      toast.success('Server removed');
      await refresh();
    } catch {
      toast.error('Could not remove server');
    } finally {
      setBusyId(null);
    }
  };

  const zoneName = (id: string) => zones.find((z) => z.id === id)?.name ?? id;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Servers"
        description="Static servers (RDP/VNC/SSH hosts) that back server-type workspaces. Each server caps its concurrent sessions."
      />

      {!isLive && (
        <Card elevation={1} className="p-4 text-sm text-muted-foreground">
          Server management is live-backend only. Run with{' '}
          <code className="rounded bg-anthracite-950/60 px-1.5 py-0.5 text-xs">NEXT_PUBLIC_API_MODE=live</code>.
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Servers" value={servers.length} icon={HardDrive} primary />
        <StatCard label="Capacity" value={servers.reduce((a, s) => a + s.maxSessions, 0)} icon={HardDrive} />
        <StatCard label="In use" value={servers.reduce((a, s) => a + (s.currentSessions ?? 0), 0)} icon={HardDrive} />
      </div>

      <Card elevation={1} className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border-subtle p-4">
          <h2 className="font-display text-lg font-medium">Registered servers</h2>
          {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        </div>
        <div className="divide-y divide-border-subtle/60">
          {servers.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">No servers registered yet.</p>
          ) : (
            servers.map((s) => (
              <div key={s.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <HardDrive className="size-4 text-gold-300" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{s.hostname}</p>
                  <p className="truncate text-xs text-muted-foreground">{s.address}</p>
                </div>
                <Badge variant="outline">{s.connectionType}</Badge>
                <Badge variant="outline">{s.zone?.name ?? zoneName(s.zoneId)}</Badge>
                <span className="hidden text-xs text-muted-foreground tnum sm:inline">
                  {s.currentSessions ?? 0} / {s.maxSessions}
                </span>
                <Button variant="ghost" size="icon-sm" disabled={busyId === s.id} onClick={() => void onDelete(s.id)}>
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            ))
          )}
        </div>
      </Card>

      <Card elevation={1} className="space-y-4 p-5">
        <h2 className="font-display text-lg font-medium">Add server</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label>Hostname</Label>
            <Input placeholder="win-rdp-01" value={hostname} onChange={(e) => setHostname(e.target.value)} />
          </div>
          <div>
            <Label>Address</Label>
            <Input placeholder="10.0.0.21" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div>
            <Label>Zone</Label>
            <select
              value={zoneId}
              onChange={(e) => setZoneId(e.target.value)}
              className="h-9 w-full rounded-md border border-border-subtle bg-[var(--surface-1)] px-2 text-sm"
            >
              {zones.length === 0 && <option value="">No zones — create one first</option>}
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Connection type</Label>
            <select
              value={connectionType}
              onChange={(e) => setConnectionType(e.target.value as (typeof CONNECTION_TYPES)[number])}
              className="h-9 w-full rounded-md border border-border-subtle bg-[var(--surface-1)] px-2 text-sm"
            >
              {CONNECTION_TYPES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Max sessions</Label>
            <Input type="number" min={1} value={maxSessions} onChange={(e) => setMaxSessions(Number(e.target.value))} />
          </div>
        </div>
        <Button size="sm" onClick={() => void onCreate()} disabled={!isLive || !zoneId || !hostname || !address || creating}>
          {creating ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
          Add server
        </Button>
      </Card>
    </div>
  );
}
