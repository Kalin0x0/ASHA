import * as React from 'react';
import type { AgentStatus, SessionStatus } from '@/lib/types';
import { cn } from '@/lib/utils';

type Tone = 'running' | 'pending' | 'paused' | 'error' | 'idle';

const TONE: Record<Tone, { dot: string; text: string; pulse?: boolean }> = {
  running: { dot: 'bg-success', text: 'text-success', pulse: true },
  pending: { dot: 'bg-warning', text: 'text-warning', pulse: true },
  paused: { dot: 'bg-info', text: 'text-info' },
  error: { dot: 'bg-destructive', text: 'text-destructive' },
  idle: { dot: 'bg-anthracite-400', text: 'text-muted-foreground' },
};

const SESSION_TONE: Record<SessionStatus, Tone> = {
  RUNNING: 'running',
  DEGRADED: 'pending',
  PROVISIONING: 'pending',
  SCHEDULED: 'pending',
  REQUESTED: 'pending',
  PAUSED: 'paused',
  TERMINATING: 'error',
  ERROR: 'error',
  DESTROYED: 'idle',
};

const AGENT_TONE: Record<AgentStatus, Tone> = {
  ONLINE: 'running',
  DRAINING: 'paused',
  UNHEALTHY: 'error',
  OFFLINE: 'idle',
};

export function StatusDot({ tone, className }: { tone: Tone; className?: string }) {
  const t = TONE[tone];
  return (
    <span className={cn('relative inline-flex size-2 items-center justify-center', className)}>
      <span className={cn('size-2 rounded-full', t.dot, t.pulse && 'animate-pulse-ring')} />
    </span>
  );
}

export function StatusPill({
  label,
  tone,
  className,
}: {
  label: string;
  tone: Tone;
  className?: string;
}) {
  const t = TONE[tone];
  return (
    <span className={cn('inline-flex items-center gap-2 text-xs font-medium', t.text, className)}>
      <StatusDot tone={tone} />
      <span className="capitalize">{label.toLowerCase()}</span>
    </span>
  );
}

export function SessionStatusPill({ status }: { status: SessionStatus }) {
  return <StatusPill label={status} tone={SESSION_TONE[status]} />;
}

export function AgentStatusPill({ status }: { status: AgentStatus }) {
  return <StatusPill label={status} tone={AGENT_TONE[status]} />;
}
