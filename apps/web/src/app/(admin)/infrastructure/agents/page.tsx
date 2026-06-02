'use client';

import { Cpu, Layers, Server } from 'lucide-react';
import { AgentHealthCard } from '@/components/composite/agent-health-card';
import { PageHeader } from '@/components/composite/page-header';
import { StatCard } from '@/components/composite/stat-card';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAgents, useZones } from '@/lib/hooks';

export default function AgentsPage() {
  const agents = useAgents();
  const zones = useZones();

  const online = agents.filter((a) => a.status === 'ONLINE').length;
  const totalSessions = agents.reduce((s, a) => s + a.sessions, 0);
  const avgCpu =
    agents.filter((a) => a.status === 'ONLINE').reduce((s, a) => s + a.cpuPct, 0) / Math.max(1, online);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agents"
        description="Docker compute agents that provision and host session containers across your zones."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Online Agents" value={online} suffix={`/ ${agents.length}`} icon={Server} primary />
        <StatCard label="Hosted Sessions" value={totalSessions} icon={Layers} />
        <StatCard label="Avg CPU" value={Math.round(avgCpu)} suffix="%" icon={Cpu} format={(v) => `${Math.round(v)}`} />
      </div>

      <Card elevation={1}>
        <CardHeader>
          <CardTitle>Zones</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          {zones.map((z) => (
            <div
              key={z.id}
              className="flex items-center gap-3 rounded-lg border border-border-subtle bg-[var(--surface-1)] px-4 py-2.5"
            >
              <span
                className={`size-2 rounded-full ${z.status === 'healthy' ? 'bg-success animate-pulse-ring' : 'bg-warning'}`}
              />
              <div>
                <p className="text-sm font-medium">{z.name}</p>
                <p className="text-xs text-muted-foreground">{z.region}</p>
              </div>
              <Badge variant="outline" className="ml-2 tnum">
                {z.agents} agents · {z.sessions} sessions
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {agents.map((agent) => (
          <AgentHealthCard key={agent.id} agent={agent} />
        ))}
      </div>
    </div>
  );
}
