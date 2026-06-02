'use client';

import { FolderTree, Loader2, Lock, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/composite/page-header';
import { StatCard } from '@/components/composite/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import {
  type ApiStorageMapping,
  type StorageKind,
  createStorageMapping,
  deleteStorageMapping,
  getStorageMappings,
  updateStorageMapping,
} from '@/lib/api/endpoints';
import { isLive } from '@/lib/api/mode';

const KINDS: { key: StorageKind; label: string; fields: { key: string; label: string; secret?: boolean }[] }[] = [
  {
    key: 'S3',
    label: 'S3',
    fields: [
      { key: 'bucket', label: 'Bucket' },
      { key: 'region', label: 'Region' },
      { key: 'accessKeyId', label: 'Access Key ID' },
      { key: 'secretAccessKey', label: 'Secret Access Key', secret: true },
      { key: 'endpoint', label: 'Endpoint (optional)' },
    ],
  },
  { key: 'NEXTCLOUD', label: 'NextCloud', fields: [{ key: 'url', label: 'WebDAV URL' }, { key: 'username', label: 'Username' }, { key: 'password', label: 'Password', secret: true }] },
  { key: 'GDRIVE', label: 'Google Drive', fields: [{ key: 'clientId', label: 'Client ID' }, { key: 'clientSecret', label: 'Client Secret', secret: true }, { key: 'refreshToken', label: 'Refresh Token', secret: true }] },
  { key: 'ONEDRIVE', label: 'OneDrive', fields: [{ key: 'clientId', label: 'Client ID' }, { key: 'clientSecret', label: 'Client Secret', secret: true }, { key: 'refreshToken', label: 'Refresh Token', secret: true }] },
  { key: 'DROPBOX', label: 'Dropbox', fields: [{ key: 'accessToken', label: 'Access Token', secret: true }] },
  { key: 'CUSTOM', label: 'Custom (rclone)', fields: [{ key: 'remote', label: 'rclone remote spec' }] },
];

const SCOPES = ['USER', 'GROUP', 'WORKSPACE'] as const;

export default function StorageMappingsPage() {
  const [mappings, setMappings] = useState<ApiStorageMapping[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [kind, setKind] = useState<StorageKind>('S3');
  const [name, setName] = useState('');
  const [mountPath, setMountPath] = useState('/mnt/storage');
  const [scope, setScope] = useState<(typeof SCOPES)[number]>('GROUP');
  const [readOnly, setReadOnly] = useState(false);
  const [config, setConfig] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    if (!isLive) return;
    setLoading(true);
    try {
      setMappings(await getStorageMappings());
    } catch {
      toast.error('Failed to load storage mappings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onCreate = async () => {
    if (!name || !mountPath) return;
    setCreating(true);
    try {
      await createStorageMapping({ name, kind, mountPath, scope, readOnly, config, enabled: true });
      toast.success('Storage mapping created');
      setName('');
      setConfig({});
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not create mapping');
    } finally {
      setCreating(false);
    }
  };

  const onToggle = async (m: ApiStorageMapping) => {
    setBusyId(m.id);
    try {
      await updateStorageMapping(m.id, { enabled: !m.enabled });
      await refresh();
    } catch {
      toast.error('Could not update mapping');
    } finally {
      setBusyId(null);
    }
  };

  const onDelete = async (id: string) => {
    setBusyId(id);
    try {
      await deleteStorageMapping(id);
      toast.success('Mapping removed');
      await refresh();
    } catch {
      toast.error('Could not remove mapping');
    } finally {
      setBusyId(null);
    }
  };

  const fields = KINDS.find((k) => k.key === kind)?.fields ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Storage Mappings"
        description="Mount network and cloud storage (S3, NextCloud, Google Drive, OneDrive, Dropbox) into sessions, scoped by user, group, or workspace."
      />

      {!isLive && (
        <Card elevation={1} className="p-4 text-sm text-muted-foreground">
          Storage mappings are live-backend only. Run with{' '}
          <code className="rounded bg-anthracite-950/60 px-1.5 py-0.5 text-xs">NEXT_PUBLIC_API_MODE=live</code>.
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label="Mappings" value={mappings.length} icon={FolderTree} primary />
        <StatCard label="Enabled" value={mappings.filter((m) => m.enabled).length} icon={FolderTree} />
      </div>

      <Card elevation={1} className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border-subtle p-4">
          <h2 className="font-display text-lg font-medium">Configured mappings</h2>
          {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        </div>
        <div className="divide-y divide-border-subtle/60">
          {mappings.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">No storage mappings configured yet.</p>
          ) : (
            mappings.map((m) => (
              <div key={m.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <FolderTree className="size-4 text-gold-300" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{m.name}</p>
                  <p className="truncate font-mono text-xs text-muted-foreground">{m.mountPath}</p>
                </div>
                <Badge variant="gold">{m.kind}</Badge>
                <Badge variant="outline">{m.scope}</Badge>
                {m.readOnly && <Lock className="size-3.5 text-muted-foreground" />}
                <Badge variant={m.enabled ? 'success' : 'outline'}>{m.enabled ? 'Enabled' : 'Disabled'}</Badge>
                <Button variant="secondary" size="sm" disabled={busyId === m.id} onClick={() => void onToggle(m)}>
                  {m.enabled ? 'Disable' : 'Enable'}
                </Button>
                <Button variant="ghost" size="icon-sm" disabled={busyId === m.id} onClick={() => void onDelete(m.id)}>
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            ))
          )}
        </div>
      </Card>

      <Card elevation={1} className="space-y-4 p-5">
        <h2 className="font-display text-lg font-medium">Add mapping</h2>
        <div className="flex flex-wrap gap-2">
          {KINDS.map((k) => (
            <button
              key={k.key}
              onClick={() => {
                setKind(k.key);
                setConfig({});
              }}
              className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
                kind === k.key
                  ? 'border-[rgba(212,175,55,0.4)] bg-gold-500/10 text-gold-300'
                  : 'border-border-subtle text-muted-foreground hover:bg-secondary'
              }`}
            >
              {k.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label>Name</Label>
            <Input placeholder="team-bucket" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>Mount path</Label>
            <Input placeholder="/mnt/storage" value={mountPath} onChange={(e) => setMountPath(e.target.value)} />
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
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={readOnly} onChange={(e) => setReadOnly(e.target.checked)} className="size-4 accent-gold-500" />
              Read-only
            </label>
          </div>
          {fields.map((f) => (
            <div key={f.key}>
              <Label>{f.label}</Label>
              <Input
                type={f.secret ? 'password' : 'text'}
                value={config[f.key] ?? ''}
                onChange={(e) => setConfig((c) => ({ ...c, [f.key]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        <Button size="sm" onClick={() => void onCreate()} disabled={!isLive || !name || !mountPath || creating}>
          {creating ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
          Add mapping
        </Button>
      </Card>
    </div>
  );
}
