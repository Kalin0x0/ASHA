'use client';

import { Boxes, Check, Download, Loader2, Plus, RefreshCw, Store, Trash2 } from 'lucide-react';
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
      toast.error('Failed to load registries');
    } finally {
      setLoading(false);
    }
  }, []);

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
      toast.success('Registry added — syncing…');
      await refresh();
    } catch {
      toast.error('Could not add registry');
    }
  };

  const onSync = async (id: string) => {
    setBusyId(id);
    try {
      const res = await syncRegistry(id);
      toast.success(`Synced ${res.upserted} workspace(s)`);
      await refresh();
    } catch {
      toast.error('Sync failed');
    } finally {
      setBusyId(null);
    }
  };

  const onInstall = async (entry: ApiMarketplaceEntry) => {
    setBusyId(entry.id);
    try {
      await installMarketplaceEntry(entry.id, true);
      toast.success(`Installed ${entry.friendlyName}`, { description: 'Image + workspace created.' });
      await refresh();
    } catch {
      toast.error('Install failed');
    } finally {
      setBusyId(null);
    }
  };

  const onDelete = async (id: string) => {
    try {
      await deleteRegistry(id);
      toast.success('Registry removed');
      await refresh();
    } catch {
      toast.error('Could not remove registry');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Image Registry"
        description="Connect open-format workspace registries, sync their catalogs, and install workspaces from the marketplace."
        actions={
          <Button variant="secondary" size="sm" onClick={() => void refresh()} disabled={!isLive || loading}>
            {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            Refresh
          </Button>
        }
      />

      {!isLive && (
        <Card elevation={1} className="p-4 text-sm text-muted-foreground">
          Registry management is live-backend only. Run with{' '}
          <code className="rounded bg-anthracite-950/60 px-1.5 py-0.5 text-xs">NEXT_PUBLIC_API_MODE=live</code> to
          connect to the API.
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Registries" value={registries.length} icon={Boxes} primary />
        <StatCard label="Marketplace apps" value={entries.length} icon={Store} />
        <StatCard label="Installed" value={entries.filter((e) => e.installed).length} icon={Check} />
      </div>

      {/* Registries */}
      <Card elevation={1} className="overflow-hidden">
        <div className="flex flex-col gap-2 border-b border-border-subtle p-4 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="text-xs text-muted-foreground">Name</label>
            <Input placeholder="Chista Community" value={newName} onChange={(e) => setNewName(e.target.value)} />
          </div>
          <div className="flex-[2]">
            <label className="text-xs text-muted-foreground">Index URL (JSON)</label>
            <Input placeholder="https://registry.example.com/index.json" value={newUrl} onChange={(e) => setNewUrl(e.target.value)} />
          </div>
          <Button size="sm" onClick={() => void onAdd()} disabled={!isLive || !newUrl || !newName}>
            <Plus className="size-3.5" /> Add
          </Button>
        </div>
        <div className="divide-y divide-border-subtle/60">
          {registries.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">No registries configured yet.</p>
          ) : (
            registries.map((r) => (
              <div key={r.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <Boxes className="size-4 text-gold-300" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{r.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{r.url}</p>
                </div>
                <Badge variant={r.type === 'FIRST_PARTY' ? 'gold' : 'outline'}>{r.type}</Badge>
                <span className="hidden text-xs text-muted-foreground sm:inline">
                  {r._count?.entries ?? 0} apps
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
          <h2 className="font-display text-lg font-medium">Marketplace</h2>
          <Input
            placeholder="Search apps…"
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
                {entry.description ?? 'No description.'}
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
                {entry.installed ? 'Installed' : 'Install'}
              </Button>
            </Card>
          ))}
          {filtered.length === 0 && (
            <p className="col-span-full py-8 text-center text-sm text-muted-foreground">
              {isLive ? 'No marketplace apps. Add a registry and sync it.' : 'Connect the live backend to browse the marketplace.'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
