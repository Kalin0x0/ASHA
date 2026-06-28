'use client';

import { Container, Cpu, Loader2, MemoryStick, MonitorCog, Package, Pencil, RefreshCw, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { AppIcon } from '@/components/composite/app-icon';
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
  useDeleteImage,
  useImages,
  useReinstallImage,
  useSetImagePullPolicy,
  useUpdateWorkspace,
} from '@/lib/hooks';
import type { ManagedImage, ManagedImageWorkspace } from '@/lib/types';

const POLICIES = ['ALWAYS', 'IF_NOT_PRESENT', 'NEVER'] as const;
const SELECT =
  'h-8 rounded-md border border-border-subtle bg-[var(--surface-1)] px-2 text-xs outline-none ring-gold-focus';

export default function ImagesPage() {
  const t = useTranslations('workspaces.images');
  const tc = useTranslations('common');
  const images = useImages();
  const deleteImage = useDeleteImage();
  const reinstallImage = useReinstallImage();
  const setPolicy = useSetImagePullPolicy();

  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<ManagedImageWorkspace | null>(null);
  const [deleting, setDeleting] = useState<ManagedImage | null>(null);
  const [busy, setBusy] = useState(false);
  const [reinstallingId, setReinstallingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return images;
    return images.filter((i) => i.friendlyName.toLowerCase().includes(q) || i.dockerImage.toLowerCase().includes(q));
  }, [images, query]);

  const totalWorkspaces = useMemo(() => images.reduce((n, i) => n + i.workspaces.length, 0), [images]);

  const onPolicy = async (id: string, policy: ManagedImage['pullPolicy']) => {
    try {
      await setPolicy(id, policy);
      toast.success(t('toasts.policyChanged'));
    } catch {
      toast.error(t('toasts.policyFailed'));
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      const res = await deleteImage(deleting.id);
      toast.success(
        res?.hostImageRemoved
          ? t('toasts.deletedDisk', { name: deleting.friendlyName })
          : t('toasts.deleted', { name: deleting.friendlyName }),
      );
      setDeleting(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('toasts.deleteFailed'));
    } finally {
      setBusy(false);
    }
  };

  const onReinstall = async (img: ManagedImage) => {
    setReinstallingId(img.id);
    try {
      await reinstallImage(img.id);
      toast.success(t('toasts.reinstalled', { name: img.friendlyName }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('toasts.reinstallFailed'));
    } finally {
      setReinstallingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('description')} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label={t('stats.images')} value={images.length} icon={Package} primary />
        <StatCard label={t('stats.workspaces')} value={totalWorkspaces} icon={Container} />
        <StatCard label={t('stats.pinned')} value={images.filter((i) => i.digest).length} icon={MonitorCog} />
      </div>

      <Input
        placeholder={t('searchPlaceholder')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="sm:max-w-sm"
      />

      {filtered.length === 0 ? (
        <EmptyState icon={Package} title={t('emptyTitle')} description={t('emptyDescription')} />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {filtered.map((img) => (
            <Card key={img.id} elevation={1} className="p-4">
              <div className="flex items-start gap-3">
                <AppIcon name={img.friendlyName} dockerImage={img.dockerImage} rounded="rounded-xl" className="size-11 shrink-0" />
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-medium">{img.friendlyName}</h3>
                  <p dir="ltr" className="truncate font-mono text-[11px] text-muted-foreground">{img.dockerImage}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline" className="text-[10px]">{img.protocol}</Badge>
                    {img.digest && <Badge variant="success" className="text-[10px]">{t('pinned')}</Badge>}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t('reinstall')}
                    title={t('reinstall')}
                    disabled={reinstallingId === img.id}
                    onClick={() => void onReinstall(img)}
                  >
                    {reinstallingId === img.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <RefreshCw className="size-4" />
                    )}
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label={t('uninstall')} title={t('uninstall')} onClick={() => setDeleting(img)}>
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between gap-2 border-t border-border-subtle pt-3 text-sm">
                <span className="text-muted-foreground">{t('pullPolicy')}</span>
                <select
                  className={SELECT}
                  value={img.pullPolicy}
                  onChange={(e) => void onPolicy(img.id, e.target.value as ManagedImage['pullPolicy'])}
                >
                  {POLICIES.map((p) => (
                    <option key={p} value={p}>{t(`pullPolicies.${p}`)}</option>
                  ))}
                </select>
              </div>

              {img.workspaces.length > 0 && (
                <div className="mt-3 space-y-2 border-t border-border-subtle pt-3">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t('resources')}</p>
                  {img.workspaces.map((ws) => (
                    <div key={ws.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
                      <span className="min-w-0 flex-1 truncate font-medium">{ws.friendlyName}</span>
                      <ResChip icon={Cpu} value={ws.cores != null ? t('vcpu', { n: ws.cores }) : t('noLimit')} />
                      <ResChip icon={MemoryStick} value={ws.memMb != null ? `${(ws.memMb / 1024).toFixed(1)} GB` : t('noLimit')} />
                      <ResChip icon={MonitorCog} value={`${ws.gpu} GPU`} />
                      <Button variant="ghost" size="sm" onClick={() => setEditing(ws)}>
                        <Pencil className="size-3.5" /> {t('editResources')}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <ResourceDialog ws={editing} onClose={() => setEditing(null)} />

      <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="size-5 text-destructive" /> {t('deleteTitle')}
            </DialogTitle>
            <DialogDescription>{t('deleteDescription', { name: deleting?.friendlyName ?? '' })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setDeleting(null)}>{tc('actions.cancel')}</Button>
            <Button variant="destructive" size="sm" disabled={busy} onClick={() => void confirmDelete()}>
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />} {t('uninstall')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ResChip({ icon: Icon, value }: { icon: typeof Cpu; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-border-subtle bg-anthracite-950/40 px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
      <Icon className="size-3" /> {value}
    </span>
  );
}

function ResourceDialog({ ws, onClose }: { ws: ManagedImageWorkspace | null; onClose: () => void }) {
  const t = useTranslations('workspaces.images');
  const tc = useTranslations('common');
  const updateWorkspace = useUpdateWorkspace();
  const [cores, setCores] = useState('2');
  const [ram, setRam] = useState('2');
  const [gpu, setGpu] = useState('0');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (ws) {
      setCores(String(ws.cores ?? 2));
      setRam(String(ws.memMb != null ? ws.memMb / 1024 : 2));
      setGpu(String(ws.gpu ?? 0));
    }
  }, [ws]);

  const save = async () => {
    if (!ws) return;
    setBusy(true);
    try {
      await updateWorkspace(ws.id, {
        cores: Number(cores) || undefined,
        memMb: ram ? Math.round(Number(ram) * 1024) || undefined : undefined,
        gpu: Number(gpu) || 0,
      });
      toast.success(t('toasts.resourcesSaved'));
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('toasts.resourcesFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!ws} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MonitorCog className="size-5 text-gold-300" /> {t('editResourcesTitle')}
          </DialogTitle>
          <DialogDescription>{ws?.friendlyName}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label htmlFor="res-cpu">{t('cpuLabel')}</Label>
            <Input id="res-cpu" type="number" min="1" dir="ltr" value={cores} onChange={(e) => setCores(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="res-ram">{t('ramLabel')}</Label>
            <Input id="res-ram" type="number" min="0.5" step="0.5" dir="ltr" value={ram} onChange={(e) => setRam(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="res-gpu">{t('gpuLabel')}</Label>
            <Input id="res-gpu" type="number" min="0" dir="ltr" value={gpu} onChange={(e) => setGpu(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose}>{tc('actions.cancel')}</Button>
          <Button size="sm" disabled={busy} onClick={() => void save()}>
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Pencil className="size-3.5" />} {tc('actions.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
