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
    <Card elevation={primary ? 'gold' : 1} className="animate-rise overflow-hidden p-5">
      <div className="flex items-start justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
        {Icon && (
          <span
            className={cn(
              'flex size-8 items-center justify-center rounded-md',
              primary ? 'bg-gold-500/15 text-gold-300' : 'bg-secondary text-muted-foreground',
            )}
          >
            <Icon className="size-4" />
          </span>
        )}
      </div>

      <div className="mt-3 flex items-end gap-2">
        <span className="font-display text-4xl font-medium leading-none tnum text-foreground">
          {format(animated)}
        </span>
        {suffix && <span className="mb-0.5 text-sm text-muted-foreground">{suffix}</span>}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        {deltaPct !== undefined ? (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 text-xs font-medium',
              good ? 'text-success' : 'text-destructive',
            )}
          >
            {positive ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
            {Math.abs(deltaPct).toFixed(1)}%
          </span>
        ) : (
          <span />
        )}
        {series && series.length > 1 && (
          <div className="h-8 w-24">
            <Sparkline data={series} height={32} stroke="var(--color-gold-500)" />
          </div>
        )}
      </div>
    </Card>
  );
}
