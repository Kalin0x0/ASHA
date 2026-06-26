'use client';

import { Container, Loader2, Pencil, Plus, Server, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AppIcon } from '@/components/composite/app-icon';
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
import {
  useCreateWorkspace,
  useDeleteWorkspace,
  useGroups,
  useLaunchSession,
  useServers,
  useSetWorkspaceAssignments,
  useUpdateWorkspace,
  useUsers,
  useWorkspaces,
  useZones,
} from '@/lib/hooks';
import type { Workspace, WorkspaceType } from '@/lib/types';
import { cn } from '@/lib/utils';

const FIELD =
  'h-9 w-full rounded-md border border-border-subtle bg-[var(--surface-1)] px-2.5 text-sm outline-none ring-gold-focus';

const blankForm = {
  type: 'CONTAINER' as WorkspaceType,
  friendlyName: '',
  name: '',
  description: '',
  category: '',
  iconUrl: '',
  dockerImage: '',
  serverId: '',
  zoneId: '',
  cores: '2',
  memGb: '2',
  gpu: '0',
  enabled: true,
};

export default function WorkspacesPage() {
  const t = useTranslations('workspaces');
  const tc = useTranslations('common');
  const workspaces = useWorkspaces();
  const servers = useServers();
  const zones = useZones();
  const launch = useLaunchSession();
  const createWorkspace = useCreateWorkspace();
  const updateWorkspace = useUpdateWorkspace();
  const deleteWorkspace = useDeleteWorkspace();
  const setAssignments = useSetWorkspaceAssignments();
  const users = useUsers();
  const groups = useGroups();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [launchingId, setLaunchingId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState<Workspace | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [form, setForm] = useState(blankForm);
  const [customCat, setCustomCat] = useState(false);
  // Access control: 'everyone' (no grants) vs 'restricted' (selected users/groups).
  const [accessMode, setAccessMode] = useState<'everyone' | 'restricted'>('everyone');
  const [assignUserIds, setAssignUserIds] = useState<string[]>([]);
  const [assignGroupIds, setAssignGroupIds] = useState<string[]>([]);
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  const selectedServer = servers.find((s) => s.id === form.serverId);
  const editing = editingId !== null;

  const categoryOptions = useMemo(
    () => Array.from(new Set(workspaces.map((w) => w.category).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [workspaces],
  );

  const closeDialog = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setEditingId(null);
      setForm(blankForm);
      setCustomCat(false);
      setAccessMode('everyone');
      setAssignUserIds([]);
      setAssignGroupIds([]);
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(blankForm);
    setCustomCat(false);
    setAccessMode('everyone');
    setAssignUserIds([]);
    setAssignGroupIds([]);
    setOpen(true);
  };

  const openEdit = (id: string) => {
    const ws = workspaces.find((w) => w.id === id);
    if (!ws) return;
    setEditingId(ws.id);
    setForm({
      type: ws.type,
      friendlyName: ws.friendlyName,
      name: ws.name,
      description: ws.description,
      category: ws.category,
      iconUrl: ws.iconUrl ?? '',
      dockerImage: ws.dockerImage,
      serverId: '',
      zoneId: '',
      cores: String(ws.cores || 2),
      memGb: String(ws.memMb ? ws.memMb / 1024 : 2),
      gpu: String(ws.gpu ?? 0),
      enabled: ws.enabled,
    });
    const uids = ws.assignedUserIds ?? [];
    const gids = ws.assignedGroupIds ?? [];
    setAssignUserIds(uids);
    setAssignGroupIds(gids);
    setAccessMode(uids.length > 0 || gids.length > 0 ? 'restricted' : 'everyone');
    setCustomCat(false);
    setOpen(true);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const friendlyName = form.friendlyName.trim();
    if (!friendlyName) {
      toast.error(t('catalog.create.nameRequired'));
      return;
    }
    if (!editing && form.type === 'SERVER' && !form.serverId) {
      toast.error(t('catalog.create.serverRequired'));
      return;
    }
    // 'everyone' ⇒ clear all grants; 'restricted' ⇒ persist the selected sets.
    const grantUserIds = accessMode === 'restricted' ? assignUserIds : [];
    const grantGroupIds = accessMode === 'restricted' ? assignGroupIds : [];
    setSubmitting(true);
    try {
      if (editing) {
        await updateWorkspace(editingId!, {
          friendlyName,
          description: form.description,
          category: form.category.trim() || undefined,
          iconUrl: form.iconUrl,
          cores: Number(form.cores) || undefined,
          memMb: form.memGb ? Math.round(Number(form.memGb) * 1024) || undefined : undefined,
          gpu: Number(form.gpu) || 0,
          enabled: form.enabled,
        });
        await setAssignments(editingId!, grantUserIds, grantGroupIds);
        toast.success(t('catalog.toasts.updated', { name: friendlyName }));
      } else {
        const isContainer = form.type === 'CONTAINER';
        const created = await createWorkspace({
          friendlyName,
          name: form.name.trim() || undefined,
          description: form.description.trim() || undefined,
          iconUrl: form.iconUrl.trim() || undefined,
          type: form.type,
          category: form.category.trim() || undefined,
          dockerImage: isContainer ? form.dockerImage.trim() || undefined : undefined,
          serverId: form.type === 'SERVER' ? form.serverId || undefined : undefined,
          zoneId: form.zoneId || undefined,
          cores: isContainer ? Number(form.cores) || undefined : undefined,
          memMb: isContainer && form.memGb ? Math.round(Number(form.memGb) * 1024) || undefined : undefined,
          gpu: isContainer ? Number(form.gpu) || 0 : 0,
        });
        if (created?.id && (grantUserIds.length > 0 || grantGroupIds.length > 0)) {
          await setAssignments(created.id, grantUserIds, grantGroupIds);
        }
        toast.success(t('catalog.toasts.created', { name: friendlyName }));
      }
      closeDialog(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t(editing ? 'catalog.toasts.updateFailed' : 'catalog.toasts.createFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await deleteWorkspace(deleting.id);
      toast.success(t('catalog.toasts.deleted', { name: deleting.friendlyName }));
      setDeleting(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('catalog.toasts.deleteFailed'));
    } finally {
      setDeleteBusy(false);
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
          <Button size="sm" onClick={openCreate}>
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
            onEdit={openEdit}
            onDelete={(id) => setDeleting(workspaces.find((w) => w.id === id) ?? null)}
          />
        ))}
      </div>

      {/* Create / Edit dialog */}
      <Dialog open={open} onOpenChange={closeDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editing ? <Pencil className="size-5 text-gold-300" /> : <Plus className="size-5 text-gold-300" />}
              {editing ? t('catalog.edit.title') : t('catalog.create.title')}
            </DialogTitle>
            <DialogDescription>{editing ? t('catalog.edit.description') : t('catalog.create.description')}</DialogDescription>
          </DialogHeader>

          <form onSubmit={onSubmit} className="space-y-3">
            {/* Machine type — only when creating (type is fixed after creation) */}
            {!editing && (
              <div>
                <Label>{t('catalog.create.machineType')}</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { v: 'CONTAINER' as const, icon: Container, label: t('catalog.create.types.container'), hint: t('catalog.create.types.containerHint') },
                      { v: 'SERVER' as const, icon: Server, label: t('catalog.create.types.server'), hint: t('catalog.create.types.serverHint') },
                    ]
                  ).map(({ v, icon: Icon, label, hint }) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => set({ type: v })}
                      className={cn(
                        'flex items-start gap-2.5 rounded-lg border p-3 text-start transition-colors ring-gold-focus',
                        form.type === v ? 'border-gold-500/60 bg-gold-500/10' : 'border-border-subtle hover:border-white/25',
                      )}
                    >
                      <Icon className={cn('mt-0.5 size-4 shrink-0', form.type === v ? 'text-gold-300' : 'text-muted-foreground')} />
                      <span>
                        <span className="block text-sm font-medium">{label}</span>
                        <span className="block text-[11px] text-muted-foreground">{hint}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

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
              {!editing && (
                <div>
                  <Label htmlFor="nw-slug">{t('catalog.create.slug')}</Label>
                  <Input id="nw-slug" dir="ltr" placeholder="windows-11" value={form.name} onChange={(e) => set({ name: e.target.value })} />
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="nw-desc">{t('catalog.create.descriptionField')}</Label>
                <Input id="nw-desc" value={form.description} onChange={(e) => set({ description: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="nw-cat">{t('catalog.create.category')}</Label>
                {customCat ? (
                  <div className="flex items-center gap-2">
                    <Input
                      id="nw-cat"
                      autoFocus
                      placeholder={t('catalog.create.categoryPlaceholder')}
                      value={form.category}
                      onChange={(e) => set({ category: e.target.value })}
                    />
                    <Button type="button" variant="ghost" size="sm" onClick={() => { setCustomCat(false); set({ category: '' }); }}>
                      {tc('actions.cancel')}
                    </Button>
                  </div>
                ) : (
                  <select
                    id="nw-cat"
                    className={FIELD}
                    value={form.category}
                    onChange={(e) => {
                      if (e.target.value === '__new__') {
                        setCustomCat(true);
                        set({ category: '' });
                      } else {
                        set({ category: e.target.value });
                      }
                    }}
                  >
                    <option value="">{t('catalog.create.categoryPlaceholder')}</option>
                    {categoryOptions.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                    <option value="__new__">{t('catalog.create.newCategory')}</option>
                  </select>
                )}
              </div>
            </div>

            {/* Icon (auto-detected from the app, or a custom URL) */}
            <div>
              <Label htmlFor="nw-icon">{t('catalog.create.iconUrl')}</Label>
              <div className="flex items-center gap-2.5">
                <AppIcon
                  name={form.friendlyName || 'New'}
                  dockerImage={form.dockerImage}
                  category={form.category}
                  iconUrl={form.iconUrl.trim() || undefined}
                  rounded="rounded-lg"
                  className="size-9 shrink-0 text-xs"
                />
                <Input id="nw-icon" dir="ltr" placeholder="https://…/logo.svg" value={form.iconUrl} onChange={(e) => set({ iconUrl: e.target.value })} />
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">{t('catalog.create.iconUrlHint')}</p>
            </div>

            {/* Docker image + zone — create-time, container only */}
            {!editing && form.type === 'CONTAINER' && (
              <>
                <div>
                  <Label htmlFor="nw-image">{t('catalog.create.dockerImage')}</Label>
                  <Input id="nw-image" dir="ltr" placeholder="kasmweb/brave:1.16.0" value={form.dockerImage} onChange={(e) => set({ dockerImage: e.target.value })} />
                  <p className="mt-1 text-[11px] text-muted-foreground">{t('catalog.create.dockerImageHint')}</p>
                </div>
                <div>
                  <Label htmlFor="nw-zone">{t('catalog.create.zone')}</Label>
                  <select id="nw-zone" className={FIELD} value={form.zoneId} onChange={(e) => set({ zoneId: e.target.value })}>
                    <option value="">{t('catalog.create.defaultZone')}</option>
                    {zones.map((z) => (
                      <option key={z.id} value={z.id}>
                        {z.name}
                        {z.region ? ` · ${z.region}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {/* Resources — shown for containers (create) and any workspace (edit) */}
            {(editing || form.type === 'CONTAINER') && (
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
            )}

            {/* Server — create-time, server type only */}
            {!editing && form.type === 'SERVER' && (
              <div>
                <Label htmlFor="nw-server">{t('catalog.create.server')}</Label>
                {servers.length === 0 ? (
                  <p className="rounded-md border border-border-subtle bg-anthracite-950/40 px-3 py-2 text-[12px] text-muted-foreground">
                    {t('catalog.create.noServers')}
                  </p>
                ) : (
                  <>
                    <select id="nw-server" className={FIELD} value={form.serverId} onChange={(e) => set({ serverId: e.target.value })}>
                      <option value="">{t('catalog.create.selectServer')}</option>
                      {servers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.hostname} · {s.connectionType} · {s.zoneName}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {selectedServer
                        ? t('catalog.create.serverZone', { protocol: selectedServer.connectionType, zone: selectedServer.zoneName })
                        : t('catalog.create.serverHintLong')}
                    </p>
                  </>
                )}
              </div>
            )}

            {/* Access control — who may see & launch this workspace */}
            <div className="space-y-2">
              <Label>{t('catalog.access.title')}</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setAccessMode('everyone')}
                  className={cn(
                    'rounded-md border px-3 py-2 text-start ring-gold-focus transition-colors',
                    accessMode === 'everyone' ? 'border-gold-500/50 bg-gold-500/10' : 'border-border-subtle hover:border-border',
                  )}
                >
                  <span className="block text-sm font-medium">{t('catalog.access.everyone')}</span>
                  <span className="block text-[11px] text-muted-foreground">{t('catalog.access.everyoneHint')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAccessMode('restricted')}
                  className={cn(
                    'rounded-md border px-3 py-2 text-start ring-gold-focus transition-colors',
                    accessMode === 'restricted' ? 'border-gold-500/50 bg-gold-500/10' : 'border-border-subtle hover:border-border',
                  )}
                >
                  <span className="block text-sm font-medium">{t('catalog.access.restricted')}</span>
                  <span className="block text-[11px] text-muted-foreground">{t('catalog.access.restrictedHint')}</span>
                </button>
              </div>

              {accessMode === 'restricted' && (
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      {t('catalog.access.users')}
                    </p>
                    <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-border-subtle p-2">
                      {users.length === 0 ? (
                        <p className="text-xs text-muted-foreground/70">{t('catalog.access.none')}</p>
                      ) : (
                        users.map((u) => (
                          <label key={u.id} className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              className="size-3.5 accent-gold-500"
                              checked={assignUserIds.includes(u.id)}
                              onChange={(e) =>
                                setAssignUserIds((p) => (e.target.checked ? [...p, u.id] : p.filter((x) => x !== u.id)))
                              }
                            />
                            <span className="truncate">{u.name || u.email}</span>
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      {t('catalog.access.groups')}
                    </p>
                    <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-border-subtle p-2">
                      {groups.length === 0 ? (
                        <p className="text-xs text-muted-foreground/70">{t('catalog.access.none')}</p>
                      ) : (
                        groups.map((g) => (
                          <label key={g.id} className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              className="size-3.5 accent-gold-500"
                              checked={assignGroupIds.includes(g.id)}
                              onChange={(e) =>
                                setAssignGroupIds((p) => (e.target.checked ? [...p, g.id] : p.filter((x) => x !== g.id)))
                              }
                            />
                            <span className="truncate">{g.name}</span>
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Enabled toggle — edit only */}
            {editing && (
              <label className="flex items-center gap-2.5 rounded-lg border border-border-subtle px-3 py-2.5 text-sm">
                <input type="checkbox" checked={form.enabled} onChange={(e) => set({ enabled: e.target.checked })} className="size-4 accent-gold-500" />
                <span>
                  <span className="block font-medium">{t('catalog.edit.enabled')}</span>
                  <span className="block text-[11px] text-muted-foreground">{t('catalog.edit.enabledHint')}</span>
                </span>
              </label>
            )}

            <DialogFooter>
              <Button type="button" variant="ghost" size="sm" onClick={() => closeDialog(false)}>
                {tc('actions.cancel')}
              </Button>
              <Button type="submit" size="sm" disabled={submitting}>
                {submitting ? <Loader2 className="size-3.5 animate-spin" /> : editing ? <Pencil className="size-3.5" /> : <Plus className="size-3.5" />}
                {editing ? t('catalog.edit.submit') : t('catalog.create.submit')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="size-5 text-destructive" /> {t('catalog.delete.title')}
            </DialogTitle>
            <DialogDescription>{t('catalog.delete.description', { name: deleting?.friendlyName ?? '' })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="ghost" size="sm" onClick={() => setDeleting(null)}>
              {tc('actions.cancel')}
            </Button>
            <Button type="button" variant="destructive" size="sm" onClick={() => void confirmDelete()} disabled={deleteBusy}>
              {deleteBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
              {t('catalog.delete.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
