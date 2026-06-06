'use client';

import { ArrowDownRight, ArrowUpRight, type LucideIcon } from 'lucide-react';
import { Sparkline } from '@/components/composite/sparkline';
import { Card } from '@/components/ui/card';
import { useCountUp } from '@/lib/use-count-up';
import { cn } from '@/lib/utils';

type Tone = 'gold' | 'info' | 'success' | 'warning';

const TONE: Record<Tone, { value: string; chip: string; stroke: string; glow: string }> = {
  gold: { value: 'text-gold-300', chip: 'bg-gold-500/15 text-gold-300 ring-gold-500/25', stroke: 'var(--color-gold-400)', glow: 'rgba(212,175,55,0.14)' },
  info: { value: 'text-foreground', chip: 'bg-info-500/12 text-info-400 ring-info-500/20', stroke: 'var(--color-info-400)', glow: 'rgba(106,143,196,0.12)' },
  success: { value: 'text-foreground', chip: 'bg-success-500/12 text-success-400 ring-success-500/20', stroke: 'var(--color-success-400)', glow: 'rgba(95,184,143,0.12)' },
  warning: { value: 'text-foreground', chip: 'bg-warn-500/12 text-warn-400 ring-warn-500/20', stroke: 'var(--color-warn-400)', glow: 'rgba(224,168,74,0.12)' },
};

export function StatCard({
  label,
  value,
  suffix,
  icon: Icon,
  deltaPct,
  series,
  goodWhenUp = true,
  primary = false,
  tone,
  format = (v: number) => Math.round(v).toLocaleString('en-US'),
}: {
  label: string;
  value: number;
  suffix?: string;
  icon?: LucideIcon;
  deltaPct?: number;
  series?: number[];
  goodWhenUp?: boolean;
  primary?: boolean;
  tone?: Tone;
  format?: (v: number) => string;
}) {
  const animated = useCountUp(value);
  const positive = (deltaPct ?? 0) >= 0;
  const good = positive === goodWhenUp;
  const t = TONE[tone ?? (primary ? 'gold' : 'info')];

  return (
    <Card
      elevation={primary ? 'gold' : 1}
      interactive
      className="animate-rise group relative overflow-hidden"
    >
      {/* Tone wash in the corner */}
      <div
        className="pointer-events-none absolute -right-12 -top-12 size-32 rounded-full blur-2xl"
        style={{ background: t.glow }}
      />

      <div className="relative flex flex-col gap-3.5 px-5 pt-5">
        {/* Label + icon */}
        <div className="flex items-start justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</span>
          {Icon && (
            <span
              className={cn(
                'flex size-9 items-center justify-center rounded-xl ring-1 transition-transform duration-200 group-hover:scale-105',
                t.chip,
              )}
            >
              <Icon className="size-4" />
            </span>
          )}
        </div>

        {/* Value + delta */}
        <div className="flex items-end gap-2">
          <span className={cn('font-display text-4xl font-medium leading-none tnum', primary ? t.value : 'text-foreground')}>
            {format(animated)}
          </span>
          {suffix && <span className="mb-0.5 text-sm text-muted-foreground">{suffix}</span>}
          {deltaPct !== undefined && (
            <span
              className={cn(
                'mb-1 ml-auto inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold tnum',
                good ? 'bg-success-500/12 text-success-400' : 'bg-error-500/12 text-error-400',
              )}
            >
              {positive ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
              {Math.abs(deltaPct).toFixed(1)}%
            </span>
          )}
        </div>
      </div>

      {/* Full-width sparkline band */}
      {series && series.length > 1 ? (
        <div className="relative mt-3 h-12 w-full">
          <Sparkline data={series} height={48} stroke={t.stroke} strokeWidth={2} />
        </div>
      ) : (
        <div className="h-5" />
      )}
    </Card>
  );
}
