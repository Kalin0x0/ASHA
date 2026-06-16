'use client';

import { HardDrive, Loader2, MonitorPlay, Pencil, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AgentInstallCard } from '@/components/composite/agent-install-card';
import { EmptyState } from '@/components/composite/empty-state';
import { PageHeader } from '@/components/composite/page-header';
import { StatCard } from '@/components/composite/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, Label } from '@/components/ui/input';
import {
  type ApiServer,
  type ApiZone,
  connectServer,
  createServer,
  deleteServer,
  getServers,
  getZones,
  updateServer,
} from '@/lib/api/endpoints';
import { isLive } from '@/lib/api/mode';

const CONNECTION_TYPES = ['RDP', 'VNC', 'SSH'] as const;
const SELECT = 'h-9 w-full rounded-md border border-border-subtle bg-[var(--surface-1)] px-2 text-sm';

export default function ServersPage() {
  const [servers, setServers] = useState<ApiServer[]>([]);
  const [zones, setZones] = useState<ApiZone[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<ApiServer | null>(null);
  const [editForm, setEditForm] = useState({
    address: '',
    maxSessions: 1,
    connectionType: 'RDP' as (typeof CONNECTION_TYPES)[number],
    username: '',
    password: '',
    security: '',
  });
  const [editBusy, setEditBusy] = useState(false);
  const [deleting, setDeleting] = useState<ApiServer | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [zoneId, setZoneId] = useState('');
  const [hostname, setHostname] = useState('');
  const [address, setAddress] = useState('');
  const [connectionType, setConnectionType] = useState<(typeof CONNECTION_TYPES)[number]>('RDP');
  const [maxSessions, setMaxSessions] = useState(1);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [security, setSecurity] = useState('nla');
  const [creating, setCreating] = useState(false);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const router = useRouter();

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
      await createServer({
        zoneId,
        hostname,
        address,
        connectionType,
        maxSessions,
        ...(username ? { username } : {}),
        ...(password ? { password } : {}),
        ...(connectionType === 'RDP' ? { security: security as 'any' | 'nla' | 'tls' | 'rdp' } : {}),
      });
      toast.success('Server added');
      setHostname('');
      setAddress('');
      setUsername('');
      setPassword('');
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not add server');
    } finally {
      setCreating(false);
    }
  };

  const onConnect = async (id: string) => {
    setConnectingId(id);
    try {
      const res = await connectServer(id);
      router.push(`/connect/${res.kasmId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not open the session');
      setConnectingId(null);
    }
  };

  const openEdit = (s: ApiServer) => {
    // Credentials are write-only (sealed server-side) — blank fields = unchanged.
    setEditForm({
      address: s.address,
      maxSessions: s.maxSessions,
      connectionType: s.connectionType,
      username: '',
      password: '',
      security: '',
    });
    setEditing(s);
  };

  const onSaveEdit = async () => {
    if (!editing) return;
    setEditBusy(true);
    try {
      await updateServer(editing.id, {
        address: editForm.address.trim() || undefined,
        maxSessions: editForm.maxSessions,
        connectionType: editForm.connectionType,
        ...(editForm.username.trim() ? { username: editForm.username.trim() } : {}),
        ...(editForm.password ? { password: editForm.password } : {}),
        ...(editForm.security ? { security: editForm.security as 'nla' } : {}),
      });
      toast.success('Server updated');
      setEditing(null);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not update server');
    } finally {
      setEditBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await deleteServer(deleting.id);
      toast.success('Server removed');
      setDeleting(null);
      await refresh();
    } catch {
      toast.error('Could not remove server');
    } finally {
      setDeleteBusy(false);
    }
  };

  const zoneName = (id: string) => zones.find((z) => z.id === id)?.name ?? id;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Servers"
        description="Static servers (RDP/VNC/SSH hosts) that back server-type workspaces. Each server caps its concurrent sessions."
      />

      <AgentInstallCard />

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
            <EmptyState icon={HardDrive} title="No servers registered" description="Add RDP, VNC, or SSH hosts to back server-type workspaces." />
          ) : (
            servers.map((s) => (
              <div key={s.id} className="flex items-center gap-3 px-5 py-3 text-sm transition-all duration-150 hover:bg-gold-500/[0.05] hover:shadow-[inset_2px_0_0_rgba(212,175,55,0.55)]">
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
                <Button
                  variant="outline"
                  size="sm"
                  loading={connectingId === s.id}
                  disabled={!isLive || connectingId !== null}
                  onClick={() => void onConnect(s.id)}
                >
                  <MonitorPlay className="size-3.5" />
                  Connect
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label="Edit server" disabled={!isLive} onClick={() => openEdit(s)}>
                  <Pencil className="size-4" />
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label="Delete server" disabled={!isLive} onClick={() => setDeleting(s)}>
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
          <div>
            <Label>Username</Label>
            <Input placeholder="admin" autoComplete="off" value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
          <div>
            <Label>Password</Label>
            <Input
              type="password"
              placeholder="••••••••"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {connectionType === 'RDP' && (
            <div>
              <Label>RDP security</Label>
              <select
                value={security}
                onChange={(e) => setSecurity(e.target.value)}
                className="h-9 w-full rounded-md border border-border-subtle bg-[var(--surface-1)] px-2 text-sm"
              >
                <option value="nla">NLA (Windows default)</option>
                <option value="any">Auto-negotiate</option>
                <option value="tls">TLS</option>
                <option value="rdp">Standard RDP (no NLA)</option>
              </select>
            </div>
          )}
        </div>
        <Button size="sm" onClick={() => void onCreate()} disabled={!isLive || !zoneId || !hostname || !address || creating}>
          {creating ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
          Add server
        </Button>
      </Card>

      {/* Edit server */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="size-5 text-gold-300" /> Edit {editing?.hostname}
            </DialogTitle>
            <DialogDescription>
              Update the connection details. Leave username / password blank to keep the current credentials.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label>Address</Label>
              <Input
                dir="ltr"
                value={editForm.address}
                onChange={(e) => setEditForm((f) => ({ ...f, address: e.target.value }))}
              />
            </div>
            <div>
              <Label>Connection type</Label>
              <select
                className={SELECT}
                value={editForm.connectionType}
                onChange={(e) => setEditForm((f) => ({ ...f, connectionType: e.target.value as (typeof CONNECTION_TYPES)[number] }))}
              >
                {CONNECTION_TYPES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Max sessions</Label>
              <Input
                type="number"
                min={1}
                value={editForm.maxSessions}
                onChange={(e) => setEditForm((f) => ({ ...f, maxSessions: Number(e.target.value) }))}
              />
            </div>
            <div>
              <Label>Username (optional)</Label>
              <Input
                autoComplete="off"
                placeholder="unchanged"
                value={editForm.username}
                onChange={(e) => setEditForm((f) => ({ ...f, username: e.target.value }))}
              />
            </div>
            <div>
              <Label>Password (optional)</Label>
              <Input
                type="password"
                autoComplete="new-password"
                placeholder="unchanged"
                value={editForm.password}
                onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))}
              />
            </div>
            {editForm.connectionType === 'RDP' && (
              <div>
                <Label>RDP security</Label>
                <select
                  className={SELECT}
                  value={editForm.security}
                  onChange={(e) => setEditForm((f) => ({ ...f, security: e.target.value }))}
                >
                  <option value="">Keep current</option>
                  <option value="nla">NLA (Windows default)</option>
                  <option value="any">Auto-negotiate</option>
                  <option value="tls">TLS</option>
                  <option value="rdp">Standard RDP (no NLA)</option>
                </select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => void onSaveEdit()} disabled={editBusy}>
              {editBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Pencil className="size-3.5" />}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation — never delete without asking */}
      <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="size-5 text-destructive" /> Delete server?
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to remove <strong className="text-foreground">{deleting?.hostname}</strong> (
              {deleting?.address})? This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button variant="destructive" size="sm" onClick={() => void confirmDelete()} disabled={deleteBusy}>
              {deleteBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
