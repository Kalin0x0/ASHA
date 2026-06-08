'use client';

import { FileCog, Home, Loader2, Package, Plus, Shield, Trash2 } from 'lucide-react';
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
  useCreateFileMapping,
  useDeleteFileMapping,
  useFileMappings,
} from '@/lib/hooks.storage';

const TARGETS = ['CONTAINER', 'WINDOWS'] as const;
const SCOPES = ['USER', 'GROUP', 'WORKSPACE'] as const;

export default function FileMappingsPage() {
  const { data: files = [], isLoading } = useFileMappings();
  const create = useCreateFileMapping();
  const remove = useDeleteFileMapping();

  const [name, setName] = useState('');
  const [target, setTarget] = useState<(typeof TARGETS)[number]>('CONTAINER');
  const [sourcePath, setSourcePath] = useState('');
  const [destPath, setDestPath] = useState('');
  const [owner, setOwner] = useState('');
  const [group, setGroup] = useState('');
  const [mode, setMode] = useState('0644');
  const [scope, setScope] = useState<(typeof SCOPES)[number]>('WORKSPACE');
  const [isHomeProfile, setIsHomeProfile] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const onCreate = async () => {
    if (!name || !sourcePath || !destPath) return;
    if (mode && !/^[0-7]{3,4}$/.test(mode)) {
      toast.error('Mode must be octal, e.g. 0644');
      return;
    }
    try {
      await create.mutateAsync({
        name,
        target,
        sourcePath,
        destPath,
        owner: owner || undefined,
        group: group || undefined,
        mode: mode || undefined,
        isHomeProfile,
        scope,
      });
      toast.success('File mapping created');
      setName('');
      setSourcePath('');
      setDestPath('');
      setOwner('');
      setGroup('');
      setMode('0644');
      setIsHomeProfile(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not create mapping');
    }
  };

  const onDelete = async (id: string) => {
    setBusyId(id);
    try {
      await remove.mutateAsync(id);
      toast.success('Mapping removed');
    } catch {
      toast.error('Could not remove mapping');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="File Mappings"
        description="Individual files injected into container sessions at launch — config files, SSH keys, certificates, or corporate trust stores. Supports POSIX ownership and mode bits."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="File mappings" value={files.length} icon={FileCog} primary />
        <StatCard label="Home-profile files" value={files.filter((f) => f.isHomeProfile).length} icon={Home} />
        <StatCard label="Restricted (0600)" value={files.filter((f) => f.mode === '0600').length} icon={Shield} />
      </div>

      <Card elevation={1} className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border-subtle p-4">
          <h2 className="font-display text-lg font-medium">Configured files</h2>
          {isLoading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        </div>
        <div className="divide-y divide-border-subtle/60">
          {files.length === 0 ? (
            <EmptyState icon={FileCog} title="No file mappings configured" description="Map host files into session containers for shared config or secrets." />
          ) : (
            files.map((f) => (
              <div key={f.id} className="flex items-center gap-3 px-5 py-3 text-sm transition-all duration-150 hover:bg-gold-500/[0.05] hover:shadow-[inset_2px_0_0_rgba(212,175,55,0.55)]">
                <FileCog className="size-4 text-gold-300" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{f.name}</p>
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    {f.sourcePath} <span className="text-gold-300/70">→</span> {f.destPath}
                  </p>
                </div>
                {f.mode && <Badge variant="outline">{f.mode}</Badge>}
                {f.isHomeProfile && (
                  <Badge variant="gold">
                    <Home className="size-3" /> home
                  </Badge>
                )}
                <Badge variant="outline">{f.target}</Badge>
                <Badge variant="outline">{f.scope}</Badge>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={busyId === f.id}
                  onClick={() => void onDelete(f.id)}
                >
                  {busyId === f.id ? (
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
        <h2 className="font-display text-lg font-medium">Add file mapping</h2>
        <div className="flex flex-wrap gap-2">
          {TARGETS.map((t) => (
            <button
              key={t}
              onClick={() => setTarget(t)}
              className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
                target === t
                  ? 'border-[rgba(212,175,55,0.4)] bg-gold-500/10 text-gold-300'
                  : 'border-border-subtle text-muted-foreground hover:bg-secondary'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label>Name</Label>
            <Input placeholder="corp-root-ca" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>Scope</Label>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as (typeof SCOPES)[number])}
              className="h-9 w-full rounded-md border border-border-subtle bg-[var(--surface-1)] px-2 text-sm"
            >
              {SCOPES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Source path</Label>
            <Input placeholder="secrets://pki/corp-root-ca.crt" value={sourcePath} onChange={(e) => setSourcePath(e.target.value)} />
          </div>
          <div>
            <Label>Destination path (in container)</Label>
            <Input placeholder="/usr/local/share/ca-certificates/corp.crt" value={destPath} onChange={(e) => setDestPath(e.target.value)} />
          </div>
          <div>
            <Label>Owner (optional)</Label>
            <Input placeholder="root" value={owner} onChange={(e) => setOwner(e.target.value)} />
          </div>
          <div>
            <Label>Group (optional)</Label>
            <Input placeholder="root" value={group} onChange={(e) => setGroup(e.target.value)} />
          </div>
          <div>
            <Label>Mode (octal)</Label>
            <Input placeholder="0644" value={mode} onChange={(e) => setMode(e.target.value)} />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isHomeProfile}
                onChange={(e) => setIsHomeProfile(e.target.checked)}
                className="size-4 accent-gold-500"
              />
              Inject into home profile
            </label>
          </div>
        </div>
        <Button
          size="sm"
          onClick={() => void onCreate()}
          disabled={!name || !sourcePath || !destPath || create.isPending}
        >
          {create.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
          Add file mapping
        </Button>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Package className="size-3.5" /> Files are written at container start with the configured owner,
          group, and mode — without baking secrets into the image.
        </p>
      </Card>
    </div>
  );
}
