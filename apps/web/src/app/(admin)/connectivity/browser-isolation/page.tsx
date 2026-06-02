'use client';

import { Loader2, Plus, ShieldHalf, Trash2 } from 'lucide-react';
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
      toast.error('Failed to load browser isolation configs');
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
      await createBrowserIsolation({ name, forwardProxy: forwardProxy || undefined, enabled: false });
      toast.success('Isolation profile created', { description: 'Disabled by default — enable after review.' });
      setName('');
      setForwardProxy('');
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not create profile');
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
      toast.error('Could not update profile');
    } finally {
      setBusyId(null);
    }
  };

  const onDelete = async (id: string) => {
    setBusyId(id);
    try {
      await deleteBrowserIsolation(id);
      toast.success('Profile removed');
      await refresh();
    } catch {
      toast.error('Could not remove profile');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Browser Isolation"
        description="Render risky web content in a disposable Neko browser container, streaming only pixels back to the user — nothing executes locally."
      />

      {!isLive && (
        <Card elevation={1} className="p-4 text-sm text-muted-foreground">
          Browser isolation is live-backend only. Run with{' '}
          <code className="rounded bg-anthracite-950/60 px-1.5 py-0.5 text-xs">NEXT_PUBLIC_API_MODE=live</code>.
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label="Profiles" value={configs.length} icon={ShieldHalf} primary />
        <StatCard label="Enabled" value={configs.filter((c) => c.enabled).length} icon={ShieldHalf} />
      </div>

      <Card elevation={1} className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border-subtle p-4">
          <h2 className="font-display text-lg font-medium">Isolation profiles</h2>
          {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        </div>
        <div className="divide-y divide-border-subtle/60">
          {configs.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">No browser isolation profiles configured yet.</p>
          ) : (
            configs.map((c) => (
              <div key={c.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <ShieldHalf className="size-4 text-gold-300" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{c.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{c.forwardProxy ? `via ${c.forwardProxy}` : 'direct'}</p>
                </div>
                <Badge variant={c.enabled ? 'success' : 'outline'}>{c.enabled ? 'Enabled' : 'Disabled'}</Badge>
                <Button variant="secondary" size="sm" disabled={busyId === c.id} onClick={() => void onToggle(c)}>
                  {c.enabled ? 'Disable' : 'Enable'}
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
        <h2 className="font-display text-lg font-medium">Add profile</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label>Name</Label>
            <Input placeholder="risky-web" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>Forward proxy (optional)</Label>
            <Input placeholder="squid-eu" value={forwardProxy} onChange={(e) => setForwardProxy(e.target.value)} />
          </div>
        </div>
        <Button size="sm" onClick={() => void onCreate()} disabled={!isLive || !name || creating}>
          {creating ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
          Add profile
        </Button>
      </Card>
    </div>
  );
}
