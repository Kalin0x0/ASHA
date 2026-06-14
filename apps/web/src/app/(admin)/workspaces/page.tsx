'use client';

import { Loader2, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/composite/page-header';
import { WorkspaceCard } from '@/components/composite/workspace-card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, Label } from '@/components/ui/input';
import { useCreateWorkspace, useLaunchSession, useWorkspaces } from '@/lib/hooks';

export default function WorkspacesPage() {
  const t = useTranslations('workspaces');
  const tc = useTranslations('common');
  const workspaces = useWorkspaces();
  const launch = useLaunchSession();
  const createWorkspace = useCreateWorkspace();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [launchingId, setLaunchingId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const blankForm = { friendlyName: '', name: '', description: '', category: '', dockerImage: '', cores: '2', memGb: '2', gpu: '0' };
  const [form, setForm] = useState(blankForm);
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const friendlyName = form.friendlyName.trim();
    if (!friendlyName) {
      toast.error(t('catalog.create.nameRequired'));
      return;
    }
    setSubmitting(true);
    try {
      await createWorkspace({
        friendlyName,
        name: form.name.trim() || undefined,
        description: form.description.trim() || undefined,
        category: form.category.trim() || undefined,
        dockerImage: form.dockerImage.trim() || undefined,
        cores: Number(form.cores) || undefined,
        memMb: form.memGb ? Math.round(Number(form.memGb) * 1024) || undefined : undefined,
        gpu: Number(form.gpu) || 0,
      });
      toast.success(t('catalog.toasts.created', { name: friendlyName }));
      setForm(blankForm);
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('catalog.toasts.createFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const categories = useMemo(
    () => ['All', ...Array.from(new Set(workspaces.map((w) => w.category)))],
    [workspaces],
  );

  const filtered = useMemo(
    () =>
      workspaces.filter((w) => {
        if (category !== 'All' && w.category !== category) return false;
        if (!query) return true;
        const q = query.toLowerCase();
        return w.friendlyName.toLowerCase().includes(q) || w.description.toLowerCase().includes(q);
      }),
    [workspaces, query, category],
  );

  const onLaunch = (id: string) => {
    setLaunchingId(id);
    setTimeout(() => {
      launch(id);
      setLaunchingId(null);
      toast.success(t('catalog.toasts.launchTitle'), { description: t('catalog.toasts.launchDescription') });
    }, 700);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('catalog.title')}
        description={t('catalog.description')}
        actions={
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="size-4" /> {t('catalog.newWorkspace')}
          </Button>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          placeholder={t('catalog.searchPlaceholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="sm:max-w-sm"
        />
        <div className="flex flex-wrap gap-1.5">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ring-gold-focus ${
                category === c
                  ? 'border-[rgba(212,175,55,0.4)] bg-gold-500/10 text-gold-300'
                  : 'border-border-subtle text-muted-foreground hover:text-foreground'
              }`}
            >
              {c === 'All' ? tc('labels.all') : c}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filtered.map((ws) => (
          <WorkspaceCard
            key={ws.id}
            workspace={ws}
            onLaunch={onLaunch}
            launching={launchingId === ws.id}
          />
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="size-5 text-gold-300" /> {t('catalog.create.title')}
            </DialogTitle>
            <DialogDescription>{t('catalog.create.description')}</DialogDescription>
          </DialogHeader>

          <form onSubmit={onCreate} className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="nw-name">{t('catalog.create.friendlyName')}</Label>
                <Input
                  id="nw-name"
                  required
                  autoFocus
                  placeholder={t('catalog.create.friendlyNamePlaceholder')}
                  value={form.friendlyName}
                  onChange={(e) => set({ friendlyName: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="nw-slug">{t('catalog.create.slug')}</Label>
                <Input id="nw-slug" dir="ltr" placeholder="brave-browser" value={form.name} onChange={(e) => set({ name: e.target.value })} />
              </div>
            </div>
            <div>
              <Label htmlFor="nw-desc">{t('catalog.create.descriptionField')}</Label>
              <Input id="nw-desc" value={form.description} onChange={(e) => set({ description: e.target.value })} />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="nw-cat">{t('catalog.create.category')}</Label>
                <Input id="nw-cat" placeholder={t('catalog.create.categoryPlaceholder')} value={form.category} onChange={(e) => set({ category: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="nw-image">{t('catalog.create.dockerImage')}</Label>
                <Input id="nw-image" dir="ltr" placeholder="kasmweb/brave:1.16.0" value={form.dockerImage} onChange={(e) => set({ dockerImage: e.target.value })} />
              </div>
            </div>
            <p className="-mt-1 text-[11px] text-muted-foreground">{t('catalog.create.dockerImageHint')}</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label htmlFor="nw-cpu">{t('catalog.create.vcpu')}</Label>
                <Input id="nw-cpu" type="number" min="1" dir="ltr" value={form.cores} onChange={(e) => set({ cores: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="nw-ram">{t('catalog.create.ramGb')}</Label>
                <Input id="nw-ram" type="number" min="1" step="0.5" dir="ltr" value={form.memGb} onChange={(e) => set({ memGb: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="nw-gpu">{t('catalog.create.gpu')}</Label>
                <Input id="nw-gpu" type="number" min="0" dir="ltr" value={form.gpu} onChange={(e) => set({ gpu: e.target.value })} />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
                {tc('actions.cancel')}
              </Button>
              <Button type="submit" size="sm" disabled={submitting}>
                {submitting ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
                {t('catalog.create.submit')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
