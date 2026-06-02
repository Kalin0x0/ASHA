'use client';

import { Cable, Loader2, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/composite/page-header';
import { StatCard } from '@/components/composite/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import {
  type ApiConnectionProxy,
  createConnectionProxy,
  deleteConnectionProxy,
  getConnectionProxies,
  updateConnectionProxy,
} from '@/lib/api/endpoints';
import { isLive } from '@/lib/api/mode';

export default function ConnectionProxiesPage() {
  const [proxies, setProxies] = useState<ApiConnectionProxy[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState(4822);
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    if (!isLive) return;
    setLoading(true);
    try {
      setProxies(await getConnectionProxies());
    } catch {
      toast.error('Failed to load connection proxies');
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
      await createConnectionProxy({ name, host: host || undefined, port, enabled: true });
      toast.success('Connection proxy added');
      setName('');
      setHost('');
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not add proxy');
    } finally {
      setCreating(false);
    }
  };

  const onToggle = async (p: ApiConnectionProxy) => {
    setBusyId(p.id);
    try {
      await updateConnectionProxy(p.id, { enabled: !p.enabled });
      await refresh();
    } catch {
      toast.error('Could not update proxy');
    } finally {
      setBusyId(null);
    }
  };

  const onDelete = async (id: string) => {
    setBusyId(id);
    try {
      await deleteConnectionProxy(id);
      toast.success('Proxy removed');
      await refresh();
    } catch {
      toast.error('Could not remove proxy');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Connection Proxies"
        description="Guacamole (guacd) endpoints that bridge RDP/VNC sessions to the browser. Register the guacd hosts that serve your zones."
      />

      {!isLive && (
        <Card elevation={1} className="p-4 text-sm text-muted-foreground">
          Connection proxy management is live-backend only. Run with{' '}
          <code className="rounded bg-anthracite-950/60 px-1.5 py-0.5 text-xs">NEXT_PUBLIC_API_MODE=live</code>.
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label="Proxies" value={proxies.length} icon={Cable} primary />
        <StatCard label="Enabled" value={proxies.filter((p) => p.enabled).length} icon={Cable} />
      </div>

      <Card elevation={1} className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border-subtle p-4">
          <h2 className="font-display text-lg font-medium">Registered proxies</h2>
          {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        </div>
        <div className="divide-y divide-border-subtle/60">
          {proxies.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">No connection proxies configured yet.</p>
          ) : (
            proxies.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <Cable className="size-4 text-gold-300" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{p.name}</p>
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    {p.host ? `${p.host}:${p.port ?? 4822}` : '—'}
                  </p>
                </div>
                <Badge variant="outline">{p.type}</Badge>
                <Badge variant={p.enabled ? 'success' : 'outline'}>{p.enabled ? 'Enabled' : 'Disabled'}</Badge>
                <Button variant="secondary" size="sm" disabled={busyId === p.id} onClick={() => void onToggle(p)}>
                  {p.enabled ? 'Disable' : 'Enable'}
                </Button>
                <Button variant="ghost" size="icon-sm" disabled={busyId === p.id} onClick={() => void onDelete(p.id)}>
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            ))
          )}
        </div>
      </Card>

      <Card elevation={1} className="space-y-4 p-5">
        <h2 className="font-display text-lg font-medium">Add proxy</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <Label>Name</Label>
            <Input placeholder="guacd-eu" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>Host</Label>
            <Input placeholder="guacd.internal" value={host} onChange={(e) => setHost(e.target.value)} />
          </div>
          <div>
            <Label>Port</Label>
            <Input type="number" min={1} value={port} onChange={(e) => setPort(Number(e.target.value))} />
          </div>
        </div>
        <Button size="sm" onClick={() => void onCreate()} disabled={!isLive || !name || creating}>
          {creating ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
          Add proxy
        </Button>
      </Card>
    </div>
  );
}
