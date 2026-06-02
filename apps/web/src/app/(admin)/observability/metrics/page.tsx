'use client';

import { Activity, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AreaTrend } from '@/components/composite/charts';
import { PageHeader } from '@/components/composite/page-header';
import { Card } from '@/components/ui/card';
import { type ApiMetricSeries, getMetricSeries } from '@/lib/api/endpoints';
import { isLive } from '@/lib/api/mode';
import type { KpiSeriesPoint } from '@/lib/types';

const METRICS = [
  { key: 'cpu', label: 'CPU utilization' },
  { key: 'memory', label: 'Memory utilization' },
  { key: 'sessions', label: 'Concurrent sessions' },
  { key: 'load', label: 'Agent load' },
];

const RANGES = [
  { hours: 6, label: '6h' },
  { hours: 24, label: '24h' },
  { hours: 72, label: '3d' },
  { hours: 168, label: '7d' },
];

export default function MetricsPage() {
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
      toast.error('Failed to load metric');
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
        title="Metrics"
        description="Time-series of platform metrics sampled from agents and the control plane."
      />

      {!isLive && (
        <Card elevation={1} className="p-4 text-sm text-muted-foreground">
          Metrics are live-backend only. Run with{' '}
          <code className="rounded bg-anthracite-950/60 px-1.5 py-0.5 text-xs">NEXT_PUBLIC_API_MODE=live</code>.
        </Card>
      )}

      <Card elevation={1} className="space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {METRICS.map((m) => (
              <button
                key={m.key}
                onClick={() => setMetric(m.key)}
                className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
                  metric === m.key
                    ? 'border-[rgba(212,175,55,0.4)] bg-gold-500/10 text-gold-300'
                    : 'border-border-subtle text-muted-foreground hover:bg-secondary'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            {RANGES.map((r) => (
              <button
                key={r.hours}
                onClick={() => setHours(r.hours)}
                className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                  hours === r.hours
                    ? 'border-[rgba(212,175,55,0.4)] bg-gold-500/10 text-gold-300'
                    : 'border-border-subtle text-muted-foreground hover:bg-secondary'
                }`}
              >
                {r.label}
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
            No samples for this metric in the selected range.
          </p>
        )}
      </Card>
    </div>
  );
}
