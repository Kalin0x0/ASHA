'use client';

import { Activity, Cpu, MemoryStick, MonitorPlay, Plus, Server } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { AgentHealthCard } from '@/components/composite/agent-health-card';
import { AreaTrend, BarRank, RingGauge } from '@/components/composite/charts';
import { StatCard } from '@/components/composite/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useActivity, useAgents, useDashboard } from '@/lib/hooks';

const ACTIVITY_TONE: Record<string, string> = {
  session: 'bg-success',
  auth: 'bg-info',
  admin: 'bg-gold-500',
  agent: 'bg-warning',
  alert: 'bg-destructive',
};

function useGreeting() {
  return useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }, []);
}

export default function DashboardPage() {
  const router = useRouter();
  const dash = useDashboard();
  const agents = useAgents();
  const activity = useActivity();
  const greeting = useGreeting();

  return (
    <div className="space-y-8">
      {/* Hero greeting */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between animate-fade-up">
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-gold-300/70">
            {greeting}
          </p>
          <h1 className="font-display text-3xl font-medium tracking-tight">
            Overview
          </h1>
          <p className="text-sm text-muted-foreground">
            Live health and utilization across every zone, agent, and session.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Badge variant="success" className="hidden gap-1.5 sm:inline-flex">
            <span className="size-1.5 rounded-full bg-success animate-pulse-ring" />
            Live
          </Badge>
          <Button size="sm" onClick={() => router.push('/')}>
            <Plus className="size-4" /> Launch workspace
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="animate-fade-up delay-100">
          <StatCard
            label="Active Sessions"
            value={dash.kpis.activeSessions.value}
            icon={MonitorPlay}
            deltaPct={dash.kpis.activeSessions.deltaPct}
            series={dash.kpis.activeSessions.series}
            primary
          />
        </div>
        <div className="animate-fade-up delay-200">
          <StatCard
            label="Online Agents"
            value={dash.kpis.onlineAgents.value}
            suffix={`/ ${dash.kpis.onlineAgents.total}`}
            icon={Server}
            tone="info"
            series={dash.kpis.onlineAgents.series}
          />
        </div>
        <div className="animate-fade-up delay-300">
          <StatCard
            label="CPU Utilization"
            value={dash.kpis.cpuUtilization.value}
            suffix="%"
            icon={Cpu}
            tone="success"
            deltaPct={dash.kpis.cpuUtilization.deltaPct}
            series={dash.kpis.cpuUtilization.series}
            goodWhenUp={false}
            format={(v) => `${Math.round(v)}`}
          />
        </div>
        <div className="animate-fade-up delay-400">
          <StatCard
            label="Memory Utilization"
            value={dash.kpis.memUtilization.value}
            suffix="%"
            icon={MemoryStick}
            tone="warning"
            deltaPct={dash.kpis.memUtilization.deltaPct}
            series={dash.kpis.memUtilization.series}
            goodWhenUp={false}
            format={(v) => `${Math.round(v)}`}
          />
        </div>
      </div>

      {/* Trend + utilization */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card elevation={1} className="xl:col-span-2 animate-fade-up delay-200">
          <CardHeader className="flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="font-display text-base font-semibold">Sessions over time</CardTitle>
              <p className="mt-0.5 text-[12px] text-muted-foreground">Concurrent sessions — last hour</p>
            </div>
            <Activity className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <AreaTrend data={dash.sessionsOverTime} />
          </CardContent>
        </Card>

        <Card elevation={1} className="animate-fade-up delay-300">
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-base font-semibold">Resource utilization</CardTitle>
            <p className="text-[12px] text-muted-foreground">Cluster-wide average</p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-y-5 place-items-center py-2">
              <RingGauge value={dash.utilization.cpu} label="CPU" tone="gold" />
              <RingGauge value={dash.utilization.mem} label="MEM" tone="info" />
              <RingGauge value={dash.utilization.gpu} label="GPU" tone="success" />
              <RingGauge value={dash.utilization.storage} label="DISK" tone="warning" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Fleet + side panels */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2 animate-fade-up delay-300">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-lg font-semibold">Agent fleet</h2>
              <p className="text-[12px] text-muted-foreground">Real-time health per host</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => router.push('/infrastructure/agents')}>
              View all
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {agents.slice(0, 4).map((agent) => (
              <AgentHealthCard key={agent.id} agent={agent} />
            ))}
          </div>
        </div>

        <div className="space-y-4 animate-fade-up delay-400">
          <Card elevation={1}>
            <CardHeader className="pb-2">
              <CardTitle className="font-display text-base font-semibold">Top workspaces</CardTitle>
            </CardHeader>
            <CardContent>
              <BarRank items={dash.topWorkspaces} />
            </CardContent>
          </Card>

          <Card elevation={1}>
            <CardHeader className="pb-2">
              <CardTitle className="font-display text-base font-semibold">Recent activity</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {activity.slice(0, 6).map((item) => (
                <div key={item.id} className="flex items-start gap-3">
                  <span
                    className={`mt-1.5 size-1.5 shrink-0 rounded-full ${ACTIVITY_TONE[item.kind] ?? 'bg-muted-foreground'}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] leading-snug">
                      <span className="font-semibold text-foreground">{item.actor}</span>{' '}
                      <span className="text-muted-foreground">{item.message}</span>
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground/60">{item.at}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
