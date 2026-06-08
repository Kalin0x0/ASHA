'use client';

import { FolderCog, HardDrive, Loader2, Plus, Trash2, Users } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/composite/empty-state';
import { PageHeader } from '@/components/composite/page-header';
import { StatCard } from '@/components/composite/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import {
  useCreatePersistentProfile,
  useDeletePersistentProfile,
  usePersistentProfiles,
} from '@/lib/hooks.storage';

const BACKENDS = ['DOCKER_VOLUME', 'S3'] as const;

function relTime(iso: string | null): string {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.round(diff / 36e5);
  if (h < 1) return 'just now';
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export default function PersistentProfilesPage() {
  const { data: profiles = [], isLoading } = usePersistentProfiles();
  const create = useCreatePersistentProfile();
  const remove = useDeletePersistentProfile();

  const [userId, setUserId] = useState('');
  const [workspaceId, setWorkspaceId] = useState('');
  const [volumeName, setVolumeName] = useState('');
  const [backend, setBackend] = useState<(typeof BACKENDS)[number]>('DOCKER_VOLUME');
  const [sizeLimitMb, setSizeLimitMb] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const totalGb = Math.round(profiles.reduce((sum, p) => sum + (p.sizeLimitMb ?? 0), 0) / 1024);

  const onCreate = async () => {
    if (!volumeName) return;
    try {
      await create.mutateAsync({
        userId: userId || undefined,
        workspaceId: workspaceId || undefined,
        volumeName,
        backend,
        sizeLimitMb: sizeLimitMb ? Number(sizeLimitMb) : undefined,
      });
      toast.success('Persistent profile created');
      setUserId('');
      setWorkspaceId('');
      setVolumeName('');
      setSizeLimitMb('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not create profile');
    }
  };

  const onDelete = async (id: string) => {
    setBusyId(id);
    try {
      await remove.mutateAsync(id);
      toast.success('Profile removed');
    } catch {
      toast.error('Could not remove profile');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Persistent Profiles"
        description="User home directories and application data that survive across sessions. Each profile is backed by a Docker volume or S3-compatible object store."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Profiles" value={profiles.length} icon={FolderCog} primary />
        <StatCard label="With user assigned" value={profiles.filter((p) => p.userId).length} icon={Users} />
        <StatCard label="Allocated (GB)" value={totalGb} icon={HardDrive} />
      </div>

      <Card elevation={1} className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border-subtle p-4">
          <h2 className="font-display text-lg font-medium">Configured profiles</h2>
          {isLoading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        </div>
        <div className="divide-y divide-border-subtle/60">
          {profiles.length === 0 ? (
            <EmptyState icon={FolderCog} title="No persistent profiles" description="Profiles preserve user data between sessions using Docker volumes or S3." />
          ) : (
            profiles.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-5 py-3 text-sm transition-all duration-150 hover:bg-gold-500/[0.05] hover:shadow-[inset_2px_0_0_rgba(212,175,55,0.55)]">
                <FolderCog className="size-4 text-gold-300" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{p.volumeName}</p>
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    {p.userId ?? 'unassigned'}
                    {p.workspaceId ? ` · ${p.workspaceId}` : ''} · last used {relTime(p.lastUsedAt)}
                  </p>
                </div>
                <Badge variant="outline">
                  {p.sizeLimitMb ? `${Math.round(p.sizeLimitMb / 1024)} GB` : 'unlimited'}
                </Badge>
                <Badge variant={p.backend === 'S3' ? 'info' : 'gold'}>
                  {p.backend === 'S3' ? 'S3' : 'Docker volume'}
                </Badge>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={busyId === p.id}
                  onClick={() => void onDelete(p.id)}
                >
                  {busyId === p.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Trash2 className="size-4 text-destructive" />
                  )}
                </Button>
              </div>
            ))
          )}
        </div>
      </Card>

      <Card elevation={1} className="space-y-4 p-5">
        <h2 className="font-display text-lg font-medium">Add persistent profile</h2>
        <div className="flex flex-wrap gap-2">
          {BACKENDS.map((b) => (
            <button
              key={b}
              onClick={() => setBackend(b)}
              className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
                backend === b
                  ? 'border-[rgba(212,175,55,0.4)] bg-gold-500/10 text-gold-300'
                  : 'border-border-subtle text-muted-foreground hover:bg-secondary'
              }`}
            >
              {b === 'DOCKER_VOLUME' ? 'Docker volume' : 'S3'}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label>Volume name</Label>
            <Input placeholder="profile-jane-chrome" value={volumeName} onChange={(e) => setVolumeName(e.target.value)} />
          </div>
          <div>
            <Label>Size limit (MB, optional)</Label>
            <Input type="number" placeholder="5120" value={sizeLimitMb} onChange={(e) => setSizeLimitMb(e.target.value)} />
          </div>
          <div>
            <Label>User ID (optional)</Label>
            <Input placeholder="user-1" value={userId} onChange={(e) => setUserId(e.target.value)} />
          </div>
          <div>
            <Label>Workspace ID (optional)</Label>
            <Input placeholder="ws-chrome" value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)} />
          </div>
        </div>
        <Button size="sm" onClick={() => void onCreate()} disabled={!volumeName || create.isPending}>
          {create.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
          Add profile
        </Button>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Users className="size-3.5" /> Profiles are normally provisioned automatically the first time a user
          launches a workspace with persistence enabled. Create one here to pre-allocate or pin a backend.
        </p>
      </Card>
    </div>
  );
}
