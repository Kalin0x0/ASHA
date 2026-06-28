'use client';

import { Server } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { RingGauge } from '@/components/composite/charts';
import { AgentStatusPill } from '@/components/ui/status-pill';
import { Card } from '@/components/ui/card';
import type { Agent } from '@/lib/types';

export function AgentHealthCard({ agent }: { agent: Agent }) {
  const t = useTranslations('dashboard');
  const tc = useTranslations('common');
  const memPct = (agent.memUsedMb / agent.memTotalMb) * 100;
  const cpuTone = agent.cpuPct > 85 ? 'destructive' : agent.cpuPct > 65 ? 'warning' : 'gold';
  const memTone = memPct > 85 ? 'destructive' : memPct > 65 ? 'warning' : 'info';

  return (
    <Card
      elevation={1}
      className="group relative overflow-hidden p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-[rgba(212,175,55,0.25)] hover:shadow-[0_8px_32px_-8px_rgba(0,0,0,0.5)]"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-secondary ring-1 ring-white/5 text-muted-foreground transition-colors group-hover:bg-[var(--surface-3)]">
            <Server className="size-4" />
          </span>
          <div>
            <p className="text-sm font-semibold leading-tight">{agent.hostname}</p>
            <p className="text-[11px] text-muted-foreground">{agent.zone}</p>
          </div>
        </div>
        <AgentStatusPill status={agent.status} />
      </div>

      {/* Gauges */}
      <div className="mt-5 flex items-center justify-around">
        <RingGauge value={agent.cpuPct} label={t('gauges.cpu')} size={80} tone={cpuTone} />
        <RingGauge value={memPct} label={t('gauges.mem')} size={80} tone={memTone} />
        {agent.gpuPct !== null && (
          <RingGauge value={agent.gpuPct} label={t('gauges.gpu')} size={80} tone="success" />
        )}
      </div>

      {/* Footer */}
      <div className="mt-4 flex items-center justify-between border-t border-border-subtle pt-3 text-[11px] text-muted-foreground">
        <span>{t('agentCard.specs', { cores: agent.cpuCores, gb: (agent.memTotalMb / 1024).toFixed(0) })}</span>
        <span className="tnum font-medium">
          <span className="text-foreground">{agent.sessions}</span>/{agent.maxSessions} {tc('units.sessions')}
        </span>
      </div>

      {/* Hover shimmer */}
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-500/0 to-transparent transition-all duration-500 group-hover:via-gold-500/50" />
    </Card>
  );
}
