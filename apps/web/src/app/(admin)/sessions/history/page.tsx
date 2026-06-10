'use client';

import { Clock, History, LogOut, UsersRound } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { EmptyState } from '@/components/composite/empty-state';
import { Monogram } from '@/components/composite/monogram';
import { PageHeader } from '@/components/composite/page-header';
import { StatCard } from '@/components/composite/stat-card';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useSessionHistory } from '@/lib/hooks';
import type { SessionEndReason } from '@/lib/types';
import { formatDuration } from '@/lib/utils';

const END_REASON_VARIANT: Record<SessionEndReason, 'outline' | 'success' | 'info' | 'destructive'> = {
  USER: 'success',
  TIMEOUT: 'info',
  ADMIN: 'outline',
  ERROR: 'destructive',
};

function formatDateTime(iso: string, locale: string): string {
  const d = new Date(iso);
  return d.toLocaleString(locale, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function HistoryPage() {
  const t = useTranslations('sessions');
  const locale = useLocale();
  const history = useSessionHistory();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!query) return history;
    const q = query.toLowerCase();
    return history.filter(
      (h) =>
        h.user.name.toLowerCase().includes(q) ||
        h.workspaceName.toLowerCase().includes(q) ||
        h.zone.toLowerCase().includes(q),
    );
  }, [history, query]);

  const uniqueUsers = new Set(history.map((h) => h.user.id)).size;
  const avgDuration =
    history.length > 0
      ? Math.floor(history.reduce((s, h) => s + h.durationSec, 0) / history.length)
      : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('history.title')}
        description={t('history.description')}
        actions={
          <Badge variant="gold" className="tnum">
            {t('history.recordCount', { count: history.length })}
          </Badge>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label={t('history.stats.totalSessions')} value={history.length} icon={History} primary />
        <StatCard label={t('history.stats.uniqueUsers')} value={uniqueUsers} icon={UsersRound} />
        <StatCard label={t('history.stats.avgDuration')} value={Math.round(avgDuration / 60)} icon={Clock} />
      </div>

      <div className="max-w-md">
        <Input
          placeholder={t('history.searchPlaceholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <Card elevation={1} className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-[color-mix(in_srgb,var(--surface-2)_45%,transparent)] text-left text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                <th className="px-5 py-3 font-medium">{t('history.columns.workspace')}</th>
                <th className="px-5 py-3 font-medium">{t('history.columns.user')}</th>
                <th className="px-5 py-3 font-medium">{t('history.columns.zone')}</th>
                <th className="px-5 py-3 font-medium">{t('history.columns.started')}</th>
                <th className="px-5 py-3 font-medium">{t('history.columns.ended')}</th>
                <th className="px-5 py-3 font-medium">{t('history.columns.duration')}</th>
                <th className="px-5 py-3 font-medium">{t('history.columns.endReason')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((h) => (
                <tr
                  key={h.id}
                  className="group border-b border-border-subtle/60 transition-all duration-150 last:border-0 hover:bg-gold-500/[0.05] hover:shadow-[inset_2px_0_0_rgba(212,175,55,0.55)]"
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <Monogram name={h.workspaceName} className="size-9" />
                      <div className="min-w-0">
                        <p className="truncate font-medium">{h.workspaceName}</p>
                        <p className="text-xs text-muted-foreground">{h.connectionType}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <p className="truncate">{h.user.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{h.user.email}</p>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{h.zone}</td>
                  <td className="px-5 py-3 text-muted-foreground">{formatDateTime(h.startedAt, locale)}</td>
                  <td className="px-5 py-3 text-muted-foreground">{formatDateTime(h.endedAt, locale)}</td>
                  <td className="px-5 py-3 tnum text-muted-foreground">{formatDuration(h.durationSec)}</td>
                  <td className="px-5 py-3">
                    <Badge variant={END_REASON_VARIANT[h.endReason]}>
                      <LogOut className="size-3" />
                      {t(`history.endReason.${h.endReason}`)}
                    </Badge>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <EmptyState
                      icon={History}
                      title={t('history.emptyTitle')}
                      description={query ? t('history.emptyDescriptionSearch') : t('history.emptyDescriptionDefault')}
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
