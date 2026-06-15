'use client';

import { FolderTree, Loader2, Lock, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
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

const KINDS: { key: StorageKind; fields: { key: string; labelKey: string; secret?: boolean }[] }[] = [
  {
    key: 'S3',
    fields: [
      { key: 'bucket', labelKey: 'bucket' },
      { key: 'region', labelKey: 'region' },
      { key: 'accessKeyId', labelKey: 'accessKeyId' },
      { key: 'secretAccessKey', labelKey: 'secretAccessKey', secret: true },
      { key: 'endpoint', labelKey: 'endpoint' },
    ],
  },
  { key: 'NEXTCLOUD', fields: [{ key: 'url', labelKey: 'webdavUrl' }, { key: 'username', labelKey: 'username' }, { key: 'password', labelKey: 'password', secret: true }] },
  { key: 'GDRIVE', fields: [{ key: 'clientId', labelKey: 'clientId' }, { key: 'clientSecret', labelKey: 'clientSecret', secret: true }, { key: 'refreshToken', labelKey: 'refreshToken', secret: true }] },
  { key: 'ONEDRIVE', fields: [{ key: 'clientId', labelKey: 'clientId' }, { key: 'clientSecret', labelKey: 'clientSecret', secret: true }, { key: 'refreshToken', labelKey: 'refreshToken', secret: true }] },
  { key: 'DROPBOX', fields: [{ key: 'accessToken', labelKey: 'accessToken', secret: true }] },
  { key: 'CUSTOM', fields: [{ key: 'remote', labelKey: 'rcloneRemote' }] },
];

const SCOPES = ['USER', 'GROUP', 'WORKSPACE'] as const;

export default function StorageMappingsPage() {
  const t = useTranslations('storage');
  const tc = useTranslations('common');
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
      toast.error(t('mappings.toasts.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onCreate = async () => {
    if (!name || !mountPath) return;
    setCreating(true);
    try {
      await createStorageMapping({ name, kind, mountPath, scope, readOnly, config, enabled: true });
      toast.success(t('mappings.toasts.created'));
      setName('');
      setConfig({});
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('mappings.toasts.createFailed'));
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
      toast.error(t('mappings.toasts.updateFailed'));
    } finally {
      setBusyId(null);
    }
  };

  const onDelete = async (id: string) => {
    setBusyId(id);
    try {
      await deleteStorageMapping(id);
      toast.success(t('mappings.toasts.removed'));
      await refresh();
    } catch {
      toast.error(t('mappings.toasts.removeFailed'));
    } finally {
      setBusyId(null);
    }
  };

  const fields = KINDS.find((k) => k.key === kind)?.fields ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('mappings.title')}
        description={t('mappings.description')}
      />

      {!isLive && (
        <Card elevation={1} className="p-4 text-sm text-muted-foreground">
          {t.rich('mappings.liveOnly', {
            code: (chunks) => (
              <code className="rounded bg-anthracite-950/60 px-1.5 py-0.5 text-xs">{chunks}</code>
            ),
          })}
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label={t('mappings.stats.mappings')} value={mappings.length} icon={FolderTree} primary />
        <StatCard label={tc('labels.enabled')} value={mappings.filter((m) => m.enabled).length} icon={FolderTree} />
      </div>

      <Card elevation={1} className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border-subtle p-4">
          <h2 className="font-display text-lg font-medium">{t('mappings.configuredTitle')}</h2>
          {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        </div>
        <div className="divide-y divide-border-subtle/60">
          {mappings.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">{t('mappings.empty')}</p>
          ) : (
            mappings.map((m) => (
              <div key={m.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <FolderTree className="size-4 text-gold-300" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{m.name}</p>
                  <p className="truncate font-mono text-xs text-muted-foreground">{m.mountPath}</p>
                </div>
                <Badge variant="gold">{t(`mappings.kinds.${m.kind}`)}</Badge>
                <Badge variant="outline">{t(`mappings.scopes.${m.scope}`)}</Badge>
                {m.readOnly && <Lock className="size-3.5 text-muted-foreground" />}
                <Badge variant={m.enabled ? 'success' : 'outline'}>{m.enabled ? tc('labels.enabled') : tc('labels.disabled')}</Badge>
                <Button variant="secondary" size="sm" disabled={busyId === m.id} onClick={() => void onToggle(m)}>
                  {m.enabled ? tc('actions.disable') : tc('actions.enable')}
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
        <h2 className="font-display text-lg font-medium">{t('mappings.addTitle')}</h2>
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
              {t(`mappings.kinds.${k.key}`)}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label>{tc('labels.name')}</Label>
            <Input placeholder="team-bucket" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>{t('mappings.form.mountPath')}</Label>
            <Input placeholder="/mnt/storage" value={mountPath} onChange={(e) => setMountPath(e.target.value)} />
          </div>
          <div>
            <Label>{t('mappings.form.scope')}</Label>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as (typeof SCOPES)[number])}
              className="h-9 w-full rounded-md border border-border-subtle bg-[var(--surface-1)] px-2 text-sm"
            >
              {SCOPES.map((s) => (
                <option key={s} value={s}>
                  {t(`mappings.scopes.${s}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={readOnly} onChange={(e) => setReadOnly(e.target.checked)} className="size-4 accent-gold-500" />
              {t('mappings.form.readOnly')}
            </label>
          </div>
          {fields.map((f) => (
            <div key={f.key}>
              <Label>{t(`mappings.fields.${f.labelKey}`)}</Label>
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
          {t('mappings.addButton')}
        </Button>
      </Card>
    </div>
  );
}
