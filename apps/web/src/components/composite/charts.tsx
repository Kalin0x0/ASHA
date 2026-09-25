'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useId, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { KpiSeriesPoint } from '@/lib/types';
import { cn } from '@/lib/utils';

/* ── Tone ramps (bright → deep) for gradient strokes & arcs ───────────────────
   These resolve through CSS variables rather than literals so each tone follows the
   theme: a ramp tuned for Night Slate is unreadable on a light card (Aurora Mint is
   8.72:1 on the dark page and 1.68:1 on white). globals.css defines both twins and
   documents the measurements. SVG stop-color and stroke both accept var().
   `gold` is the brand tone and keeps its name because `variant="gold"` and
   `elevation="gold"` are the same vocabulary on Badge and Card — renaming one of
   the three would be worse than renaming none. The status tones stay off the brand
   ramp on purpose, so success, warning and error never read as an action. */
const TONE = {
  gold: ['var(--tone-brand-bright)', 'var(--tone-brand-deep)'],
  success: ['var(--tone-success-bright)', 'var(--tone-success-deep)'],
  warning: ['var(--tone-warn-bright)', 'var(--tone-warn-deep)'],
  destructive: ['var(--tone-error-bright)', 'var(--tone-error-deep)'],
  info: ['var(--tone-info-bright)', 'var(--tone-info-deep)'],
} as const;

export function AreaTrend({ data, height = 260 }: { data: KpiSeriesPoint[]; height?: number }) {
  const t = useTranslations('dashboard');
  const id = useId().replace(/:/g, '');
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 12, right: 8, left: -14, bottom: 0 }}>
        <defs>
          <linearGradient id={`fill-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--tone-brand-bright)" stopOpacity={0.26} />
            <stop offset="48%" stopColor="var(--tone-brand-deep)" stopOpacity={0.07} />
            <stop offset="100%" stopColor="var(--tone-brand-deep)" stopOpacity={0} />
          </linearGradient>
          <linearGradient id={`stroke-${id}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--tone-brand-deep)" />
            <stop offset="50%" stopColor="var(--tone-brand-bright)" />
            <stop offset="100%" stopColor="var(--tone-brand-deep)" />
          </linearGradient>
          <filter id={`glow-${id}`} x="-20%" y="-50%" width="140%" height="200%">
            <feGaussianBlur stdDeviation="3.2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--border-subtle)" strokeDasharray="0" />
        <XAxis dataKey="t" hide />
        <YAxis
          tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={34}
          allowDecimals={false}
        />
        <Tooltip
          cursor={{ stroke: 'var(--tone-brand-deep)', strokeOpacity: 0.35, strokeWidth: 1 }}
          contentStyle={{
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            fontSize: 12,
            boxShadow: 'var(--shadow-lifted)',
          }}
          labelStyle={{ color: 'var(--muted-foreground)' }}
          itemStyle={{ color: 'var(--foreground)' }}
          labelFormatter={() => t('charts.sessionsTooltip')}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke={`url(#stroke-${id})`}
          strokeWidth={2.5}
          fill={`url(#fill-${id})`}
          filter={`url(#glow-${id})`}
          dot={false}
          activeDot={{ r: 4, fill: 'var(--tone-brand-bright)', stroke: 'var(--card)', strokeWidth: 2 }}
          animationDuration={700}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function RingGauge({
  value,
  label,
  sub,
  size = 108,
  tone = 'gold',
}: {
  value: number;
  label?: string;
  sub?: string;
  size?: number;
  tone?: keyof typeof TONE;
}) {
  const t = useTranslations('dashboard');
  const id = useId().replace(/:/g, '');
  const [bright, deep] = TONE[tone];
  const sw = 9;
  const r = (size - sw - 6) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.min(100, Math.max(0, value));
  const offset = c - (pct / 100) * c;
  // Sweep the arc from empty → value on mount (the dashoffset transition does the
  // animation). Falls back to the final value instantly under reduced-motion.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(t);
  }, []);
  const drawnOffset = mounted ? offset : c;

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
      role="img"
      aria-label={t('charts.gaugeAria', { label: label ?? t('charts.value'), value: Math.round(pct) })}
    >
      <svg width={size} height={size} className="-rotate-90 overflow-visible">
        <defs>
          <linearGradient id={`ring-${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={bright} />
            <stop offset="100%" stopColor={deep} />
          </linearGradient>
          <filter id={`rglow-${id}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.6" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border-subtle)" strokeWidth={sw} opacity={0.55} />
        {pct > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={`url(#ring-${id})`}
            strokeWidth={sw}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={drawnOffset}
            filter={`url(#rglow-${id})`}
            className="transition-[stroke-dashoffset] duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
          />
        )}
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="gauge-value font-display text-2xl font-medium leading-none tnum" style={{ color: bright }}>
          {Math.round(pct)}
          <span className="text-sm align-top text-muted-foreground">%</span>
        </span>
        {label && (
          <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</span>
        )}
        {sub && <span className="text-[10px] text-muted-foreground/60 tnum">{sub}</span>}
      </div>
    </div>
  );
}

export function BarRank({
  items,
  className,
}: {
  items: { name: string; sessions: number }[];
  className?: string;
}) {
  const t = useTranslations('dashboard');
  const max = Math.max(1, ...items.map((i) => i.sessions));
  const ramp = [TONE.gold, TONE.info, TONE.success, TONE.warning, TONE.destructive];

  if (items.length === 0) {
    return (
      <div className={cn('flex h-24 items-center justify-center text-sm text-muted-foreground/70', className)}>
        {t('charts.noWorkspaceActivity')}
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col gap-3.5', className)}>
      {items.map((item, i) => {
        const [bright, deep] = ramp[i % ramp.length] ?? TONE.gold;
        return (
          <div key={item.name} className="group flex items-center gap-3">
            <span className="w-4 shrink-0 text-end text-[11px] font-semibold tnum text-muted-foreground/50">
              {i + 1}
            </span>
            <span className="w-28 shrink-0 truncate text-[13px] text-foreground/90">{item.name}</span>
            <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-[var(--muted)]">
              <div
                className="h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none"
                style={{
                  width: `${(item.sessions / max) * 100}%`,
                  background: `linear-gradient(90deg, ${deep}, ${bright})`,
                  boxShadow: `0 0 12px -2px ${bright}80`,
                }}
              />
            </div>
            <span className="w-8 shrink-0 text-end text-sm font-semibold tnum text-foreground">{item.sessions}</span>
          </div>
        );
      })}
    </div>
  );
}
