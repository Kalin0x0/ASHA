'use client';

import { ArrowDownRight, ArrowUpRight, type LucideIcon } from 'lucide-react';
import { Sparkline } from '@/components/composite/sparkline';
import { Card } from '@/components/ui/card';
import { useCountUp } from '@/lib/use-count-up';
import { cn } from '@/lib/utils';

export function StatCard({
  label,
  value,
  suffix,
  icon: Icon,
  deltaPct,
  series,
  goodWhenUp = true,
  primary = false,
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
  format?: (v: number) => string;
}) {
  const animated = useCountUp(value);
  const positive = (deltaPct ?? 0) >= 0;
  const good = positive === goodWhenUp;

  return (
    <Card
      elevation={primary ? 'gold' : 1}
      className={cn(
        'animate-rise relative overflow-hidden',
        primary && 'bg-gradient-to-br from-[var(--surface-2)] to-[var(--surface-1)]',
      )}
    >
      {/* Subtle inner glow for primary */}
      {primary && (
        <div className="pointer-events-none absolute inset-0 rounded-lg bg-gradient-to-br from-gold-500/[0.06] to-transparent" />
      )}

      <div className="relative flex flex-col gap-4 p-5 pb-4">
        {/* Top row: label + icon */}
        <div className="flex items-start justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            {label}
          </span>
          {Icon && (
            <span
              className={cn(
                'flex size-9 items-center justify-center rounded-xl transition-colors',
                primary
                  ? 'bg-gold-500/15 text-gold-300 ring-1 ring-gold-500/20'
                  : 'bg-secondary text-muted-foreground ring-1 ring-white/5',
              )}
            >
              <Icon className="size-4" />
            </span>
          )}
        </div>

        {/* Value */}
        <div className="flex items-end gap-1.5">
          <span
            className={cn(
              'font-display text-4xl font-medium leading-none tnum',
              primary ? 'text-gold-300' : 'text-foreground',
            )}
          >
            {format(animated)}
          </span>
          {suffix && (
            <span className="mb-0.5 text-sm text-muted-foreground">{suffix}</span>
          )}
        </div>

        {/* Bottom row: delta + sparkline */}
        <div className="flex items-center justify-between gap-3">
          {deltaPct !== undefined ? (
            <span
              className={cn(
                'inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                good
                  ? 'bg-success/10 text-success'
                  : 'bg-destructive/10 text-destructive',
              )}
            >
              {positive ? (
                <ArrowUpRight className="size-3" />
              ) : (
                <ArrowDownRight className="size-3" />
              )}
              {Math.abs(deltaPct).toFixed(1)}%
            </span>
          ) : (
            <span />
          )}
          {series && series.length > 1 && (
            <div className="h-9 w-28">
              <Sparkline
                data={series}
                height={36}
                stroke={primary ? 'var(--color-gold-400)' : 'var(--color-anthracite-300)'}
              />
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
