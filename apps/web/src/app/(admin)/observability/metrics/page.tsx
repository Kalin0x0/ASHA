'use client';

import { Activity, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AreaTrend } from '@/components/composite/charts';
import { PageHeader } from '@/components/composite/page-header';
import { Card } from '@/components/ui/card';
import { type ApiMetricSeries, getMetricSeries } from '@/lib/api/endpoints';
import { isLive } from '@/lib/api/mode';
import type { KpiSeriesPoint } from '@/lib/types';

const METRIC_KEYS = ['cpu', 'memory', 'sessions', 'load'];

const RANGE_HOURS = [6, 24, 72, 168];

export default function MetricsPage() {
  const t = useTranslations('observability');
  const [metric, setMetric] = useState('cpu');
  const [hours, setHours] = useState(24);
  const [series, setSeries] = useState<KpiSeriesPoint[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!isLive) return;
    setLoading(true);
    try {
      const res: ApiMetricSeries = await getMetricSeries(metric, hours);
      setSeries(res.series.map((p) => ({ t: p.hour.slice(11) + ':00', value: p.avg })));
    } catch {
      toast.error(t('metrics.loadError'));
    } finally {
      setLoading(false);
    }
  }, [metric, hours]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('metrics.title')}
        description={t('metrics.description')}
      />

      {!isLive && (
        <Card elevation={1} className="p-4 text-sm text-muted-foreground">
          {t('metrics.liveOnlyNotice')}{' '}
          <code className="rounded bg-anthracite-950/60 px-1.5 py-0.5 text-xs">NEXT_PUBLIC_API_MODE=live</code>.
        </Card>
      )}

      <Card elevation={1} className="space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {METRIC_KEYS.map((m) => (
              <button
                key={m}
                onClick={() => setMetric(m)}
                className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
                  metric === m
                    ? 'border-[rgba(212,175,55,0.4)] bg-gold-500/10 text-gold-300'
                    : 'border-border-subtle text-muted-foreground hover:bg-secondary'
                }`}
              >
                {t(`metrics.metricLabels.${m}`)}
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            {RANGE_HOURS.map((r) => (
              <button
                key={r}
                onClick={() => setHours(r)}
                className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                  hours === r
                    ? 'border-[rgba(212,175,55,0.4)] bg-gold-500/10 text-gold-300'
                    : 'border-border-subtle text-muted-foreground hover:bg-secondary'
                }`}
              >
                {t(`metrics.rangeLabels.h${r}`)}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex h-60 items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : series.length > 0 ? (
          <AreaTrend data={series} />
        ) : (
          <p className="py-16 text-center text-sm text-muted-foreground">
            <Activity className="mx-auto mb-2 size-6 opacity-40" />
            {t('metrics.noSamples')}
          </p>
        )}
      </Card>
    </div>
  );
}
