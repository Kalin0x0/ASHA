'use client';

import { Film, Loader2, MonitorPlay, Server, TrendingUp } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AreaTrend, BarRank } from '@/components/composite/charts';
import { PageHeader } from '@/components/composite/page-header';
import { StatCard } from '@/components/composite/stat-card';
import { Card } from '@/components/ui/card';
import {
  type ApiReportSummary,
  type ApiTopWorkspace,
  getReportSummary,
  getSessionsOverTime,
  getTopWorkspaces,
} from '@/lib/api/endpoints';
import { isLive } from '@/lib/api/mode';
import type { KpiSeriesPoint } from '@/lib/types';

export default function ReportingPage() {
  const [summary, setSummary] = useState<ApiReportSummary | null>(null);
  const [trend, setTrend] = useState<KpiSeriesPoint[]>([]);
  const [top, setTop] = useState<ApiTopWorkspace[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!isLive) return;
    setLoading(true);
    try {
      const [s, sot, tw] = await Promise.all([
        getReportSummary(),
        getSessionsOverTime(30),
        getTopWorkspaces(30, 10),
      ]);
      setSummary(s);
      setTrend(sot.series.map((p) => ({ t: p.date, value: p.count })));
      setTop(tw);
    } catch {
      toast.error('Failed to load reporting data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reporting"
        description="Platform-wide usage analytics: session volume over time, top workspaces, and capacity."
      />

      {!isLive && (
        <Card elevation={1} className="p-4 text-sm text-muted-foreground">
          Reporting is live-backend only. Run with{' '}
          <code className="rounded bg-anthracite-950/60 px-1.5 py-0.5 text-xs">NEXT_PUBLIC_API_MODE=live</code>.
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total sessions" value={summary?.totalSessions ?? 0} icon={MonitorPlay} primary />
        <StatCard label="Active now" value={summary?.activeSessions ?? 0} icon={MonitorPlay} />
        <StatCard label="Agents online" value={summary?.agents.online ?? 0} icon={Server} format={(v) => `${v} / ${summary?.agents.total ?? 0}`} />
        <StatCard label="Recordings" value={summary?.recordings ?? 0} icon={Film} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card elevation={1} className="space-y-4 p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-medium">Sessions — last 30 days</h2>
            {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          </div>
          {trend.length > 0 ? (
            <AreaTrend data={trend} />
          ) : (
            <p className="py-12 text-center text-sm text-muted-foreground">
              <TrendingUp className="mx-auto mb-2 size-6 opacity-40" />
              No session data in range.
            </p>
          )}
        </Card>

        <Card elevation={1} className="space-y-4 p-5">
          <h2 className="font-display text-lg font-medium">Top workspaces</h2>
          {top.length > 0 ? (
            <BarRank items={top.map((t) => ({ name: t.name, sessions: t.sessions }))} />
          ) : (
            <p className="py-12 text-center text-sm text-muted-foreground">No workspace usage yet.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
