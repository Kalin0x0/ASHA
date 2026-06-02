'use client';

import { Activity, Cpu, MemoryStick, MonitorPlay, Plus, Server } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { AgentHealthCard } from '@/components/composite/agent-health-card';
import { AreaTrend, RingGauge } from '@/components/composite/charts';
import { BarRank } from '@/components/composite/charts';
import { PageHeader } from '@/components/composite/page-header';
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

export default function DashboardPage() {
  const router = useRouter();
  const dash = useDashboard();
  const agents = useAgents();
  const activity = useActivity();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        description="Live health and utilization across every zone, agent, and session."
        actions={
          <>
            <Badge variant="success" className="hidden gap-1.5 sm:inline-flex">
              <span className="size-1.5 rounded-full bg-success animate-pulse-ring" />
              Live
            </Badge>
            <Button size="sm" onClick={() => router.push('/')}>
              <Plus className="size-4" /> Launch workspace
            </Button>
          </>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Active Sessions"
          value={dash.kpis.activeSessions.value}
          icon={MonitorPlay}
          deltaPct={dash.kpis.activeSessions.deltaPct}
          series={dash.kpis.activeSessions.series}
          primary
        />
        <StatCard
          label="Online Agents"
          value={dash.kpis.onlineAgents.value}
          suffix={`/ ${dash.kpis.onlineAgents.total}`}
          icon={Server}
          series={dash.kpis.onlineAgents.series}
        />
        <StatCard
          label="CPU Utilization"
          value={dash.kpis.cpuUtilization.value}
          suffix="%"
          icon={Cpu}
          deltaPct={dash.kpis.cpuUtilization.deltaPct}
          series={dash.kpis.cpuUtilization.series}
          goodWhenUp={false}
          format={(v) => `${Math.round(v)}`}
        />
        <StatCard
          label="Memory Utilization"
          value={dash.kpis.memUtilization.value}
          suffix="%"
          icon={MemoryStick}
          deltaPct={dash.kpis.memUtilization.deltaPct}
          series={dash.kpis.memUtilization.series}
          goodWhenUp={false}
          format={(v) => `${Math.round(v)}`}
        />
      </div>

      {/* Trend + utilization */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card elevation={1} className="xl:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Sessions over time</CardTitle>
              <p className="text-sm text-muted-foreground">Concurrent sessions, last hour</p>
            </div>
            <Activity className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <AreaTrend data={dash.sessionsOverTime} />
          </CardContent>
        </Card>

        <Card elevation={1}>
          <CardHeader>
            <CardTitle>Resource utilization</CardTitle>
            <p className="text-sm text-muted-foreground">Cluster-wide average</p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-y-4 place-items-center">
              <RingGauge value={dash.utilization.cpu} label="CPU" tone="gold" />
              <RingGauge value={dash.utilization.mem} label="MEM" tone="info" />
              <RingGauge value={dash.utilization.gpu} label="GPU" tone="success" />
              <RingGauge value={dash.utilization.storage} label="DISK" tone="warning" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Fleet + side */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-medium">Agent fleet</h2>
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

        <div className="space-y-4">
          <Card elevation={1}>
            <CardHeader>
              <CardTitle>Top workspaces</CardTitle>
            </CardHeader>
            <CardContent>
              <BarRank items={dash.topWorkspaces} />
            </CardContent>
          </Card>

          <Card elevation={1}>
            <CardHeader>
              <CardTitle>Recent activity</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3.5">
              {activity.slice(0, 6).map((item) => (
                <div key={item.id} className="flex items-start gap-3">
                  <span
                    className={`mt-1.5 size-1.5 shrink-0 rounded-full ${ACTIVITY_TONE[item.kind] ?? 'bg-muted-foreground'}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-snug">
                      <span className="font-medium text-foreground">{item.actor}</span>{' '}
                      <span className="text-muted-foreground">{item.message}</span>
                    </p>
                    <p className="text-xs text-muted-foreground/70">{item.at}</p>
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
