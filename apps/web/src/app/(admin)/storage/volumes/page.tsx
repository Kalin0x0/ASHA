'use client';

import { Database, HardDrive, Loader2, Lock, Package, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/composite/page-header';
import { StatCard } from '@/components/composite/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import {
  useCreateVolumeMapping,
  useDeleteVolumeMapping,
  useVolumeMappings,
} from '@/lib/hooks.storage';

export default function VolumeMappingsPage() {
  const { data: volumes = [], isLoading } = useVolumeMappings();
  const create = useCreateVolumeMapping();
  const remove = useDeleteVolumeMapping();

  const [name, setName] = useState('');
  const [hostPath, setHostPath] = useState('');
  const [destPath, setDestPath] = useState('/data');
  const [readOnly, setReadOnly] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const onCreate = async () => {
    if (!name || !hostPath || !destPath) return;
    try {
      await create.mutateAsync({ name, hostPath, destPath, readOnly });
      toast.success('Volume mapping created');
      setName('');
      setHostPath('');
      setDestPath('/data');
      setReadOnly(true);
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
        title="Volume Mappings"
        description="Named Docker volumes or host-path mounts injected into workspace containers at launch. Use these to share datasets, code repositories, or shared assets across sessions."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Volume mappings" value={volumes.length} icon={Database} primary />
        <StatCard label="Read-only" value={volumes.filter((v) => v.readOnly).length} icon={Lock} />
        <StatCard label="Read-write" value={volumes.filter((v) => !v.readOnly).length} icon={HardDrive} />
      </div>

      <Card elevation={1} className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border-subtle p-4">
          <h2 className="font-display text-lg font-medium">Configured volumes</h2>
          {isLoading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        </div>
        <div className="divide-y divide-border-subtle/60">
          {volumes.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">No volume mappings configured yet.</p>
          ) : (
            volumes.map((v) => (
              <div key={v.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <Database className="size-4 text-gold-300" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{v.name}</p>
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    {v.hostPath} <span className="text-gold-300/70">→</span> {v.destPath}
                  </p>
                </div>
                {v.readOnly ? (
                  <Badge variant="outline">
                    <Lock className="size-3" /> read-only
                  </Badge>
                ) : (
                  <Badge variant="success">read-write</Badge>
                )}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={busyId === v.id}
                  onClick={() => void onDelete(v.id)}
                >
                  {busyId === v.id ? (
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
        <h2 className="font-display text-lg font-medium">Add volume mapping</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label>Name</Label>
            <Input placeholder="shared-datasets" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>Host path or volume name</Label>
            <Input placeholder="/srv/chista/datasets" value={hostPath} onChange={(e) => setHostPath(e.target.value)} />
          </div>
          <div>
            <Label>Destination path (in container)</Label>
            <Input placeholder="/data/datasets" value={destPath} onChange={(e) => setDestPath(e.target.value)} />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={readOnly}
                onChange={(e) => setReadOnly(e.target.checked)}
                className="size-4 accent-gold-500"
              />
              Read-only
            </label>
          </div>
        </div>
        <Button
          size="sm"
          onClick={() => void onCreate()}
          disabled={!name || !hostPath || !destPath || create.isPending}
        >
          {create.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
          Add volume
        </Button>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Package className="size-3.5" /> Host paths and named Docker volumes are both supported. Read-only
          mounts are recommended for shared datasets and model stores.
        </p>
      </Card>
    </div>
  );
}
