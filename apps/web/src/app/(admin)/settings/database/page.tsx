'use client';

import { Database, DatabaseBackup, HardDriveDownload, Loader2, Play } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/composite/page-header';
import { StatCard } from '@/components/composite/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { type ApiBackup, getBackups, runBackup } from '@/lib/api/endpoints';
import { isLive } from '@/lib/api/mode';

function formatBytes(n: number): string {
  if (!n) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(n) / Math.log(1024));
  return `${(n / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export default function DatabasePage() {
  const t = useTranslations('settings');
  const locale = useLocale();
  const [backups, setBackups] = useState<ApiBackup[]>([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);

  const refresh = useCallback(async () => {
    if (!isLive) return;
    setLoading(true);
    try {
      setBackups(await getBackups());
    } catch {
      toast.error(t('database.toasts.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onRun = async () => {
    setRunning(true);
    try {
      const res = await runBackup();
      if (res.status === 'completed') toast.success(t('database.toasts.completed'));
      else toast.error(t('database.toasts.failed'), { description: t('database.toasts.failedDescription') });
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('database.toasts.runFailed'));
    } finally {
      setRunning(false);
    }
  };

  const lastOk = backups.find((b) => b.status === 'completed');

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('database.title')}
        description={t('database.description')}
        actions={
          <Button size="sm" onClick={() => void onRun()} disabled={!isLive || running}>
            {running ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
            {t('database.runBackupNow')}
          </Button>
        }
      />

      {!isLive && (
        <Card elevation={1} className="p-4 text-sm text-muted-foreground">
          {t.rich('database.liveOnly', {
            code: (chunks) => (
              <code className="rounded bg-anthracite-950/60 px-1.5 py-0.5 text-xs">{chunks}</code>
            ),
          })}
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label={t('database.stats.backups')} value={backups.length} icon={DatabaseBackup} primary />
        <StatCard
          label={t('database.stats.latestSize')}
          value={lastOk?.bytes ?? 0}
          icon={Database}
          format={(v) => formatBytes(v)}
        />
        <StatCard
          label={t('database.stats.lastBackup')}
          value={0}
          icon={HardDriveDownload}
          format={() => (lastOk ? new Date(lastOk.createdAt).toLocaleDateString(locale) : '—')}
        />
      </div>

      <Card elevation={1} className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border-subtle p-4">
          <h2 className="font-display text-lg font-medium">{t('database.history')}</h2>
          {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        </div>
        <div className="divide-y divide-border-subtle/60">
          {backups.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">{t('database.empty')}</p>
          ) : (
            backups.map((b) => (
              <div key={b.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <DatabaseBackup className="size-4 text-gold-300" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-xs">{b.filename}</p>
                </div>
                <span className="text-xs text-muted-foreground tnum">{formatBytes(b.bytes)}</span>
                <Badge variant={b.status === 'completed' ? 'success' : b.status === 'failed' ? 'outline' : 'info'}>
                  {t.has(`database.status.${b.status}`) ? t(`database.status.${b.status}`) : b.status}
                </Badge>
                <span className="shrink-0 text-xs text-muted-foreground tnum">
                  {new Date(b.createdAt).toLocaleString(locale)}
                </span>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
