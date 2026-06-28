'use client';

import { Bug, CheckCircle2, Search, ShieldAlert, Zap } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { BugDetailDialog } from '@/components/composite/bug-detail-dialog';
import { EmptyState } from '@/components/composite/empty-state';
import { PageHeader } from '@/components/composite/page-header';
import { StatCard } from '@/components/composite/stat-card';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { severityVariant, sourceVariant, statusVariant } from '@/lib/bug-display';
import { useBugReports, useBugStats } from '@/lib/hooks';
import type { BugStatus } from '@/lib/types';

const selectClass =
  'h-9.5 rounded-md border border-input bg-[var(--surface-1)] px-3 text-sm focus-visible:border-[rgba(212,175,55,0.5)] focus-visible:shadow-[var(--gold-glow)] focus-visible:outline-none';

const STATUS_FILTERS: (BugStatus | 'ALL' | 'ACTIVE')[] = ['ACTIVE', 'ALL', 'OPEN', 'IN_PROGRESS', 'RESOLVED'];
const ACTIVE: BugStatus[] = ['OPEN', 'TRIAGED', 'IN_PROGRESS'];

export default function BugReportsPage() {
  const t = useTranslations('support.page');
  const tStatus = useTranslations('support.status');
  const tSeverity = useTranslations('support.severity');
  const tSource = useTranslations('support.source');
  const locale = useLocale();

  const reports = useBugReports();
  const stats = useBugStats();
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>('ACTIVE');
  const [sourceFilter, setSourceFilter] = useState<'ALL' | 'USER' | 'AUTOMATIC'>('ALL');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return reports.filter((b) => {
      if (statusFilter === 'ACTIVE' && !ACTIVE.includes(b.status)) return false;
      if (statusFilter !== 'ACTIVE' && statusFilter !== 'ALL' && b.status !== statusFilter) return false;
      if (sourceFilter !== 'ALL' && b.source !== sourceFilter) return false;
      if (q && !`${b.title} ${b.errorCode ?? ''} ${b.route ?? ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [reports, query, statusFilter, sourceFilter]);

  const fmtRel = (iso: string) => new Date(iso).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('description')} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label={t('stats.open')} value={stats.open} icon={Bug} primary />
        <StatCard label={t('stats.critical')} value={stats.critical} icon={ShieldAlert} tone="warning" />
        <StatCard label={t('stats.automatic')} value={stats.automatic} icon={Zap} tone="info" />
        <StatCard label={t('stats.resolved')} value={stats.resolved} icon={CheckCircle2} tone="success" />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative max-w-md flex-1">
          <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t('searchPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-10 ps-9"
          />
        </div>
        <select className={selectClass} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as never)}>
          {STATUS_FILTERS.map((s) => (
            <option key={s} value={s}>
              {s === 'ALL' ? t('filters.all') : s === 'ACTIVE' ? t('filters.active') : tStatus(s)}
            </option>
          ))}
        </select>
        <select className={selectClass} value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value as never)}>
          <option value="ALL">{t('filters.allSources')}</option>
          <option value="USER">{tSource('USER')}</option>
          <option value="AUTOMATIC">{tSource('AUTOMATIC')}</option>
        </select>
      </div>

      <Card elevation={1} className="overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState icon={Bug} title={t('empty.title')} description={t('empty.description')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-start text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-5 py-3 text-start font-medium">{t('table.severity')}</th>
                  <th className="px-5 py-3 text-start font-medium">{t('table.report')}</th>
                  <th className="px-5 py-3 text-start font-medium">{t('table.status')}</th>
                  <th className="px-5 py-3 text-start font-medium">{t('table.occurrences')}</th>
                  <th className="px-5 py-3 text-start font-medium">{t('table.lastSeen')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((b) => (
                  <tr
                    key={b.id}
                    onClick={() => setSelectedId(b.id)}
                    className="cursor-pointer border-b border-border-subtle/60 transition-colors last:border-0 hover:bg-secondary/40"
                  >
                    <td className="px-5 py-3">
                      <Badge variant={severityVariant[b.severity]}>{tSeverity(b.severity)}</Badge>
                    </td>
                    <td className="px-5 py-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{b.title}</p>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                          <Badge variant={sourceVariant[b.source]} className="px-1.5 py-0">
                            {tSource(b.source)}
                          </Badge>
                          {b.errorCode && <code className="font-mono text-gold-300/80">{b.errorCode}</code>}
                          {b.fix && <span className="text-success">{t('table.hasFix')}</span>}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <Badge variant={statusVariant[b.status]}>{tStatus(b.status)}</Badge>
                    </td>
                    <td className="px-5 py-3 tnum text-muted-foreground">{b.occurrences}</td>
                    <td className="px-5 py-3 text-muted-foreground">{fmtRel(b.lastSeenAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <BugDetailDialog id={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}
