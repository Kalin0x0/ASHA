'use client';

import { Cast, Copy, Loader2, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/composite/page-header';
import { StatCard } from '@/components/composite/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import {
  type ApiCasting,
  type ApiWorkspace,
  createCasting,
  deleteCasting,
  getCasting,
  getWorkspaces,
  updateCasting,
} from '@/lib/api/endpoints';
import { isLive } from '@/lib/api/mode';

export default function CastingPage() {
  const [casts, setCasts] = useState<ApiCasting[]>([]);
  const [workspaces, setWorkspaces] = useState<ApiWorkspace[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState('');
  const [allowAnonymous, setAllowAnonymous] = useState(false);
  const [maxConcurrent, setMaxConcurrent] = useState<number | ''>('');
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    if (!isLive) return;
    setLoading(true);
    try {
      const [c, ws] = await Promise.all([getCasting(), getWorkspaces()]);
      setCasts(c);
      setWorkspaces(ws);
      if (!workspaceId && ws.length > 0) setWorkspaceId(ws[0]!.id);
    } catch {
      toast.error('Failed to load casting configs');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onCreate = async () => {
    if (!workspaceId) return;
    setCreating(true);
    try {
      await createCasting({
        workspaceId,
        allowAnonymous,
        requireAuth: !allowAnonymous,
        maxConcurrent: maxConcurrent === '' ? undefined : Number(maxConcurrent),
        enabled: true,
      });
      toast.success('Cast link created');
      setMaxConcurrent('');
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not create cast link');
    } finally {
      setCreating(false);
    }
  };

  const onToggle = async (c: ApiCasting) => {
    setBusyId(c.id);
    try {
      await updateCasting(c.id, { enabled: !c.enabled });
      await refresh();
    } catch {
      toast.error('Could not update cast link');
    } finally {
      setBusyId(null);
    }
  };

  const onDelete = async (id: string) => {
    setBusyId(id);
    try {
      await deleteCasting(id);
      toast.success('Cast link removed');
      await refresh();
    } catch {
      toast.error('Could not remove cast link');
    } finally {
      setBusyId(null);
    }
  };

  const wsName = (c: ApiCasting) => c.workspace?.friendlyName || c.workspace?.name || c.workspaceId;
  const castUrl = (c: ApiCasting) => `${window.location.origin}/cast/${c.id}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Casting"
        description="Publish shareable links that launch a workspace on demand — optionally anonymous — for kiosks, demos, and embedded access."
      />

      {!isLive && (
        <Card elevation={1} className="p-4 text-sm text-muted-foreground">
          Casting is live-backend only. Run with{' '}
          <code className="rounded bg-anthracite-950/60 px-1.5 py-0.5 text-xs">NEXT_PUBLIC_API_MODE=live</code>.
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label="Cast links" value={casts.length} icon={Cast} primary />
        <StatCard label="Anonymous" value={casts.filter((c) => c.allowAnonymous).length} icon={Cast} />
      </div>

      <Card elevation={1} className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border-subtle p-4">
          <h2 className="font-display text-lg font-medium">Cast links</h2>
          {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        </div>
        <div className="divide-y divide-border-subtle/60">
          {casts.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">No cast links configured yet.</p>
          ) : (
            casts.map((c) => (
              <div key={c.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <Cast className="size-4 text-gold-300" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{wsName(c)}</p>
                  <p className="truncate font-mono text-xs text-muted-foreground">/cast/{c.id}</p>
                </div>
                {c.allowAnonymous ? <Badge variant="warning">Anonymous</Badge> : <Badge variant="outline">Auth required</Badge>}
                {c.maxConcurrent != null && <Badge variant="outline">max {c.maxConcurrent}</Badge>}
                <Badge variant={c.enabled ? 'success' : 'outline'}>{c.enabled ? 'Live' : 'Off'}</Badge>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="Copy link"
                  onClick={() => {
                    void navigator.clipboard.writeText(castUrl(c));
                    toast.success('Link copied');
                  }}
                >
                  <Copy className="size-4" />
                </Button>
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
        <h2 className="font-display text-lg font-medium">Create cast link</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <Label>Workspace</Label>
            <select
              value={workspaceId}
              onChange={(e) => setWorkspaceId(e.target.value)}
              className="h-9 w-full rounded-md border border-border-subtle bg-[var(--surface-1)] px-2 text-sm"
            >
              {workspaces.length === 0 && <option value="">No workspaces</option>}
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.friendlyName || w.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Max concurrent (optional)</Label>
            <Input
              type="number"
              min={1}
              placeholder="unlimited"
              value={maxConcurrent}
              onChange={(e) => setMaxConcurrent(e.target.value === '' ? '' : Number(e.target.value))}
            />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={allowAnonymous} onChange={(e) => setAllowAnonymous(e.target.checked)} className="size-4 accent-gold-500" />
              Allow anonymous access
            </label>
          </div>
        </div>
        <Button size="sm" onClick={() => void onCreate()} disabled={!isLive || !workspaceId || creating}>
          {creating ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
          Create cast link
        </Button>
      </Card>
    </div>
  );
}
