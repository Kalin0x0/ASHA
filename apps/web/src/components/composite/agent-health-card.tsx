'use client';

import { Server } from 'lucide-react';
import { RingGauge } from '@/components/composite/charts';
import { AgentStatusPill } from '@/components/ui/status-pill';
import { Card } from '@/components/ui/card';
import type { Agent } from '@/lib/types';

export function AgentHealthCard({ agent }: { agent: Agent }) {
  const memPct = (agent.memUsedMb / agent.memTotalMb) * 100;
  const cpuTone = agent.cpuPct > 85 ? 'destructive' : agent.cpuPct > 65 ? 'warning' : 'gold';
  const memTone = memPct > 85 ? 'destructive' : memPct > 65 ? 'warning' : 'info';

  return (
    <Card elevation={1} className="p-5">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-md bg-secondary text-muted-foreground">
            <Server className="size-4" />
          </span>
          <div>
            <p className="text-sm font-medium leading-tight">{agent.hostname}</p>
            <p className="text-xs text-muted-foreground">{agent.zone}</p>
          </div>
        </div>
        <AgentStatusPill status={agent.status} />
      </div>

      <div className="mt-4 flex items-center justify-around">
        <RingGauge value={agent.cpuPct} label="CPU" size={84} tone={cpuTone} />
        <RingGauge value={memPct} label="MEM" size={84} tone={memTone} />
        {agent.gpuPct !== null && <RingGauge value={agent.gpuPct} label="GPU" size={84} tone="success" />}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-border-subtle pt-3 text-xs text-muted-foreground">
        <span>
          {agent.cpuCores} cores · {(agent.memTotalMb / 1024).toFixed(0)} GB
        </span>
        <span className="tnum">
          {agent.sessions}/{agent.maxSessions} sessions
        </span>
      </div>
    </Card>
  );
}
