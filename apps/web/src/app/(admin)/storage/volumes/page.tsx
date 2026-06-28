'use client';

import { Database, HardDrive, Loader2, Lock, Package, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/composite/empty-state';
import { PageHeader } from '@/components/composite/page-header';
import { StatCard } from '@/components/composite/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useConfirm } from '@/components/ui/confirm';
import { Input, Label } from '@/components/ui/input';
import {
  useCreateVolumeMapping,
  useDeleteVolumeMapping,
  useVolumeMappings,
} from '@/lib/hooks.storage';

export default function VolumeMappingsPage() {
  const t = useTranslations('storage');
  const tc = useTranslations('common');
  const confirm = useConfirm();
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
      toast.success(t('volumes.toasts.created'));
      setName('');
      setHostPath('');
      setDestPath('/data');
      setReadOnly(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('volumes.toasts.createFailed'));
    }
  };

  const onDelete = async (id: string) => {
    const vol = volumes.find((v) => v.id === id);
    if (!(await confirm({ title: tc('confirm.deleteNamed', { name: vol?.name ?? '' }) }))) return;
    setBusyId(id);
    try {
      await remove.mutateAsync(id);
      toast.success(t('volumes.toasts.removed'));
    } catch {
      toast.error(t('volumes.toasts.removeFailed'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('volumes.title')}
        description={t('volumes.description')}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label={t('volumes.stats.volumeMappings')} value={volumes.length} icon={Database} primary />
        <StatCard label={t('volumes.stats.readOnly')} value={volumes.filter((v) => v.readOnly).length} icon={Lock} />
        <StatCard label={t('volumes.stats.readWrite')} value={volumes.filter((v) => !v.readOnly).length} icon={HardDrive} />
      </div>

      <Card elevation={1} className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border-subtle p-4">
          <h2 className="font-display text-lg font-medium">{t('volumes.configuredTitle')}</h2>
          {isLoading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        </div>
        <div className="divide-y divide-border-subtle/60">
          {volumes.length === 0 ? (
            <EmptyState icon={Database} title={t('volumes.empty.title')} description={t('volumes.empty.description')} />
          ) : (
            volumes.map((v) => (
              <div key={v.id} className="flex items-center gap-3 px-5 py-3 text-sm transition-all duration-150 hover:bg-gold-500/[0.05] hover:shadow-[inset_2px_0_0_rgba(212,175,55,0.55)]">
                <Database className="size-4 text-gold-300" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{v.name}</p>
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    {v.hostPath} <span className="text-gold-300/70">→</span> {v.destPath}
                  </p>
                </div>
                {v.readOnly ? (
                  <Badge variant="outline">
                    <Lock className="size-3" /> {t('volumes.badges.readOnly')}
                  </Badge>
                ) : (
                  <Badge variant="success">{t('volumes.badges.readWrite')}</Badge>
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
        <h2 className="font-display text-lg font-medium">{t('volumes.addTitle')}</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label>{tc('labels.name')}</Label>
            <Input placeholder="shared-datasets" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>{t('volumes.form.hostPath')}</Label>
            <Input placeholder="/srv/asha/datasets" value={hostPath} onChange={(e) => setHostPath(e.target.value)} />
          </div>
          <div>
            <Label>{t('volumes.form.destPath')}</Label>
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
              {t('volumes.form.readOnly')}
            </label>
          </div>
        </div>
        <Button
          size="sm"
          onClick={() => void onCreate()}
          disabled={!name || !hostPath || !destPath || create.isPending}
        >
          {create.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
          {t('volumes.addButton')}
        </Button>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Package className="size-3.5" /> {t('volumes.footnote')}
        </p>
      </Card>
    </div>
  );
}
