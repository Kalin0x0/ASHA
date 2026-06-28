'use client';

import { FileCog, Home, Loader2, Package, Plus, Shield, Trash2 } from 'lucide-react';
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
  useCreateFileMapping,
  useDeleteFileMapping,
  useFileMappings,
} from '@/lib/hooks.storage';

const TARGETS = ['CONTAINER', 'WINDOWS'] as const;
const SCOPES = ['USER', 'GROUP', 'WORKSPACE'] as const;

export default function FileMappingsPage() {
  const t = useTranslations('storage');
  const tc = useTranslations('common');
  const confirm = useConfirm();
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
      toast.error(t('fileMappings.toasts.modeInvalid'));
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
      toast.success(t('fileMappings.toasts.created'));
      setName('');
      setSourcePath('');
      setDestPath('');
      setOwner('');
      setGroup('');
      setMode('0644');
      setIsHomeProfile(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('fileMappings.toasts.createFailed'));
    }
  };

  const onDelete = async (id: string) => {
    const file = files.find((f) => f.id === id);
    if (!(await confirm({ title: tc('confirm.deleteNamed', { name: file?.name ?? '' }) }))) return;
    setBusyId(id);
    try {
      await remove.mutateAsync(id);
      toast.success(t('fileMappings.toasts.removed'));
    } catch {
      toast.error(t('fileMappings.toasts.removeFailed'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('fileMappings.title')}
        description={t('fileMappings.description')}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label={t('fileMappings.stats.fileMappings')} value={files.length} icon={FileCog} primary />
        <StatCard label={t('fileMappings.stats.homeProfileFiles')} value={files.filter((f) => f.isHomeProfile).length} icon={Home} />
        <StatCard label={t('fileMappings.stats.restricted')} value={files.filter((f) => f.mode === '0600').length} icon={Shield} />
      </div>

      <Card elevation={1} className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border-subtle p-4">
          <h2 className="font-display text-lg font-medium">{t('fileMappings.configuredTitle')}</h2>
          {isLoading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        </div>
        <div className="divide-y divide-border-subtle/60">
          {files.length === 0 ? (
            <EmptyState icon={FileCog} title={t('fileMappings.empty.title')} description={t('fileMappings.empty.description')} />
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
                    <Home className="size-3" /> {t('fileMappings.badges.home')}
                  </Badge>
                )}
                <Badge variant="outline">{t(`fileMappings.targets.${f.target}`)}</Badge>
                <Badge variant="outline">{t(`fileMappings.scopes.${f.scope}`)}</Badge>
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
        <h2 className="font-display text-lg font-medium">{t('fileMappings.addTitle')}</h2>
        <div className="flex flex-wrap gap-2">
          {TARGETS.map((tgt) => (
            <button
              key={tgt}
              onClick={() => setTarget(tgt)}
              className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
                target === tgt
                  ? 'border-[rgba(212,175,55,0.4)] bg-gold-500/10 text-gold-300'
                  : 'border-border-subtle text-muted-foreground hover:bg-secondary'
              }`}
            >
              {t(`fileMappings.targets.${tgt}`)}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label>{tc('labels.name')}</Label>
            <Input placeholder="corp-root-ca" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>{t('fileMappings.form.scope')}</Label>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as (typeof SCOPES)[number])}
              className="h-9 w-full rounded-md border border-border-subtle bg-[var(--surface-1)] px-2 text-sm"
            >
              {SCOPES.map((s) => (
                <option key={s} value={s}>
                  {t(`fileMappings.scopes.${s}`)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>{t('fileMappings.form.sourcePath')}</Label>
            <Input placeholder="secrets://pki/corp-root-ca.crt" value={sourcePath} onChange={(e) => setSourcePath(e.target.value)} />
          </div>
          <div>
            <Label>{t('fileMappings.form.destPath')}</Label>
            <Input placeholder="/usr/local/share/ca-certificates/corp.crt" value={destPath} onChange={(e) => setDestPath(e.target.value)} />
          </div>
          <div>
            <Label>{t('fileMappings.form.owner')}</Label>
            <Input placeholder="root" value={owner} onChange={(e) => setOwner(e.target.value)} />
          </div>
          <div>
            <Label>{t('fileMappings.form.group')}</Label>
            <Input placeholder="root" value={group} onChange={(e) => setGroup(e.target.value)} />
          </div>
          <div>
            <Label>{t('fileMappings.form.mode')}</Label>
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
              {t('fileMappings.form.homeProfile')}
            </label>
          </div>
        </div>
        <Button
          size="sm"
          onClick={() => void onCreate()}
          disabled={!name || !sourcePath || !destPath || create.isPending}
        >
          {create.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
          {t('fileMappings.addButton')}
        </Button>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Package className="size-3.5" /> {t('fileMappings.footnote')}
        </p>
      </Card>
    </div>
  );
}
