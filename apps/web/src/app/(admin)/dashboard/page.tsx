'use client';

import { Activity, ArrowDownRight, ArrowUpRight, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { AgentHealthCard } from '@/components/composite/agent-health-card';
import { AreaTrend, BarRank, RingGauge } from '@/components/composite/charts';
import { Sparkline } from '@/components/composite/sparkline';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useActivity, useAgents, useDashboard } from '@/lib/hooks';
import { useCountUp } from '@/lib/use-count-up';
import { cn } from '@/lib/utils';

const ACTIVITY_TONE: Record<string, string> = {
  session: 'bg-success',
  auth: 'bg-info',
  admin: 'bg-gold-500',
  agent: 'bg-warning',
  alert: 'bg-destructive',
};

function useGreeting() {
  return useMemo(() => {
    const h = new Date().getHours();
    return h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening';
  }, []);
}

function MiniStat({
  label,
  value,
  suffix,
  series,
  stroke,
}: {
  label: string;
  value: number;
  suffix?: string;
  series?: number[];
  stroke: string;
}) {
  const v = useCountUp(value);
  return (
    <div className="flex items-center gap-3 px-6 py-4">
      <div className="min-w-0">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</div>
        <div className="font-display text-xl font-medium tnum text-foreground">
          {Math.round(v)}
          {suffix && <span className="text-sm text-muted-foreground">{suffix}</span>}
        </div>
      </div>
      {series && series.length > 1 && (
        <div className="ms-auto h-8 w-16 opacity-80">
          <Sparkline data={series} height={32} stroke={stroke} strokeWidth={2} />
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const t = useTranslations('dashboard');
  const router = useRouter();
  const dash = useDashboard();
  const agents = useAgents();
  const activity = useActivity();
  const greeting = useGreeting();
  const sessions = useCountUp(dash.kpis.activeSessions.value);
  const delta = dash.kpis.activeSessions.deltaPct ?? 0;

  return (
    <div className="space-y-5">
      {/* ── Command-center hero ─────────────────────────────── */}
      <Card elevation="glass" className="relative overflow-hidden animate-fade-up">
        <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-500/60 to-transparent" />
        <div className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-gold-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -left-16 bottom-0 size-56 rounded-full bg-info-500/[0.07] blur-3xl" />

        <div className="relative grid gap-8 p-6 lg:grid-cols-[1fr_1.35fr] lg:gap-12 lg:p-8">
          {/* Hero metric */}
          <div className="flex flex-col">
            <div className="flex items-center gap-2.5">
              <span className="eyebrow">{t('hero.eyebrow')}</span>
              <span className="text-muted-foreground/40">·</span>
              <span className="text-[11px] font-medium text-muted-foreground">{t(`greeting.${greeting}`)}</span>
              <span className="ms-auto inline-flex items-center gap-1.5 rounded-full border border-success/20 bg-success/10 px-2 py-0.5 text-[11px] font-semibold text-success">
                <span className="size-1.5 rounded-full bg-success animate-pulse-ring" /> {t('hero.live')}
              </span>
            </div>

            <div className="mt-6 flex items-end gap-3">
              <span className="text-gradient-gold font-display text-6xl font-medium leading-none tnum">
                {Math.round(sessions)}
              </span>
              <span
                className={cn(
                  'mb-1.5 inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold tnum',
                  delta >= 0 ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive',
                )}
              >
                {delta >= 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
                {Math.abs(delta).toFixed(1)}%
              </span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{t('hero.activeSessionsCaption')}</p>

            <Button className="mt-7 w-fit gap-2" onClick={() => router.push('/')}>
              <Plus className="size-4" /> {t('hero.launchWorkspace')}
            </Button>
          </div>

          {/* Hero chart */}
          <div className="flex min-w-0 flex-col">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[12px] font-medium text-muted-foreground">{t('hero.sessionsLastHour')}</span>
              <Activity className="size-4 text-muted-foreground/60" />
            </div>
            <div className="flex-1">
              <AreaTrend data={dash.sessionsOverTime} height={188} />
            </div>
          </div>
        </div>

        {/* Stat bar */}
        <div className="relative grid grid-cols-1 divide-y divide-border-subtle border-t border-border-subtle sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <MiniStat
            label={t('stats.onlineAgents')}
            value={dash.kpis.onlineAgents.value}
            suffix={`/${dash.kpis.onlineAgents.total}`}
            series={dash.kpis.onlineAgents.series}
            stroke="var(--color-info-400)"
          />
          <MiniStat
            label={t('stats.cpu')}
            value={dash.kpis.cpuUtilization.value}
            suffix="%"
            series={dash.kpis.cpuUtilization.series}
            stroke="var(--color-success-400)"
          />
          <MiniStat
            label={t('stats.memory')}
            value={dash.kpis.memUtilization.value}
            suffix="%"
            series={dash.kpis.memUtilization.series}
            stroke="var(--color-warn-400)"
          />
        </div>
      </Card>

      {/* ── Bento ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Main column */}
        <div className="space-y-5 lg:col-span-9">
          <div className="grid gap-5 md:grid-cols-12">
            <Card elevation="glass" className="animate-fade-up delay-100 md:col-span-5">
              <CardHeader className="pb-2">
                <CardTitle className="font-display text-base font-semibold">{t('cards.resourceUtilization.title')}</CardTitle>
                <p className="text-[12px] text-muted-foreground">{t('cards.resourceUtilization.subtitle')}</p>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 place-items-center gap-y-5 py-2">
                  <RingGauge value={dash.utilization.cpu} label={t('gauges.cpu')} tone="gold" />
                  <RingGauge value={dash.utilization.mem} label={t('gauges.mem')} tone="info" />
                  <RingGauge value={dash.utilization.gpu} label={t('gauges.gpu')} tone="success" />
                  <RingGauge value={dash.utilization.storage} label={t('gauges.disk')} tone="warning" />
                </div>
              </CardContent>
            </Card>

            <Card elevation="glass" className="animate-fade-up delay-200 md:col-span-7">
              <CardHeader className="flex-row items-center justify-between pb-2">
                <div>
                  <CardTitle className="font-display text-base font-semibold">{t('cards.agentFleet.title')}</CardTitle>
                  <p className="text-[12px] text-muted-foreground">{t('cards.agentFleet.subtitle')}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => router.push('/infrastructure/agents')}>
                  {t('cards.agentFleet.viewAll')}
                </Button>
              </CardHeader>
              <CardContent>
                {agents.length === 0 ? (
                  <div className="flex h-32 items-center justify-center text-sm text-muted-foreground/70">
                    {t('cards.agentFleet.empty')}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {agents.slice(0, 4).map((a) => (
                      <AgentHealthCard key={a.id} agent={a} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card elevation="glass" className="animate-fade-up delay-200">
            <CardHeader className="pb-2">
              <CardTitle className="font-display text-base font-semibold">{t('cards.topWorkspaces.title')}</CardTitle>
              <p className="text-[12px] text-muted-foreground">{t('cards.topWorkspaces.subtitle')}</p>
            </CardHeader>
            <CardContent>
              <BarRank items={dash.topWorkspaces} />
            </CardContent>
          </Card>
        </div>

        {/* Live activity rail */}
        <Card elevation="glass" className="animate-fade-up delay-300 lg:col-span-3">
          <CardHeader className="flex-row items-center justify-between pb-2">
            <CardTitle className="font-display text-base font-semibold">{t('cards.liveActivity.title')}</CardTitle>
            <span className="size-1.5 rounded-full bg-success animate-pulse-ring" />
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {activity.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground/70">{t('cards.liveActivity.empty')}</p>
            ) : (
              activity.slice(0, 9).map((item) => (
                <div key={item.id} className="flex items-start gap-3">
                  <span className={cn('mt-1.5 size-1.5 shrink-0 rounded-full', ACTIVITY_TONE[item.kind] ?? 'bg-muted-foreground')} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] leading-snug">
                      <span className="font-semibold text-foreground">{item.actor}</span>{' '}
                      <span className="text-muted-foreground">{item.message}</span>
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground/60">{item.at}</p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
