'use client';

import { useId } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { KpiSeriesPoint } from '@/lib/types';
import { cn } from '@/lib/utils';

/* ── Tone ramps (bright → deep) for gradient strokes & arcs ───────────────── */
const TONE = {
  gold: ['#ecd584', '#d4af37'],
  success: ['#7fcaa6', '#4aa37c'],
  warning: ['#edbd6e', '#c9933b'],
  destructive: ['#e08980', '#bd564d'],
  info: ['#8aa8d6', '#587bb0'],
} as const;

export function AreaTrend({ data, height = 260 }: { data: KpiSeriesPoint[]; height?: number }) {
  const id = useId().replace(/:/g, '');
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 12, right: 8, left: -14, bottom: 0 }}>
        <defs>
          <linearGradient id={`fill-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#e0c25c" stopOpacity={0.26} />
            <stop offset="48%" stopColor="#d4af37" stopOpacity={0.07} />
            <stop offset="100%" stopColor="#d4af37" stopOpacity={0} />
          </linearGradient>
          <linearGradient id={`stroke-${id}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#b8923a" />
            <stop offset="50%" stopColor="#ecd584" />
            <stop offset="100%" stopColor="#e0c25c" />
          </linearGradient>
          <filter id={`glow-${id}`} x="-20%" y="-50%" width="140%" height="200%">
            <feGaussianBlur stdDeviation="3.2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.05)" strokeDasharray="0" />
        <XAxis dataKey="t" hide />
        <YAxis
          tick={{ fill: 'var(--color-anthracite-300)', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={34}
          allowDecimals={false}
        />
        <Tooltip
          cursor={{ stroke: 'var(--color-gold-500)', strokeOpacity: 0.35, strokeWidth: 1 }}
          contentStyle={{
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            fontSize: 12,
            boxShadow: 'var(--shadow-lifted)',
          }}
          labelStyle={{ color: 'var(--color-anthracite-200)' }}
          itemStyle={{ color: 'var(--color-gold-300)' }}
          labelFormatter={() => 'Sessions'}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke={`url(#stroke-${id})`}
          strokeWidth={2.5}
          fill={`url(#fill-${id})`}
          filter={`url(#glow-${id})`}
          dot={false}
          activeDot={{ r: 4, fill: '#ecd584', stroke: '#14141f', strokeWidth: 2 }}
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
  const id = useId().replace(/:/g, '');
  const [bright, deep] = TONE[tone];
  const sw = 9;
  const r = (size - sw - 6) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.min(100, Math.max(0, value));
  const offset = c - (pct / 100) * c;

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${label ?? 'Value'}: ${Math.round(pct)} percent`}
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
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-anthracite-600)" strokeWidth={sw} opacity={0.55} />
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
            strokeDashoffset={offset}
            filter={`url(#rglow-${id})`}
            className="transition-[stroke-dashoffset] duration-700 ease-out motion-reduce:transition-none"
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
  const max = Math.max(1, ...items.map((i) => i.sessions));
  const ramp = [TONE.gold, TONE.info, TONE.success, TONE.warning, TONE.destructive];

  if (items.length === 0) {
    return (
      <div className={cn('flex h-24 items-center justify-center text-sm text-muted-foreground/70', className)}>
        No workspace activity yet
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col gap-3.5', className)}>
      {items.map((item, i) => {
        const [bright, deep] = ramp[i % ramp.length] ?? TONE.gold;
        return (
          <div key={item.name} className="group flex items-center gap-3">
            <span className="w-4 shrink-0 text-right text-[11px] font-semibold tnum text-muted-foreground/50">
              {i + 1}
            </span>
            <span className="w-28 shrink-0 truncate text-[13px] text-foreground/90">{item.name}</span>
            <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-[var(--color-anthracite-700)]">
              <div
                className="h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none"
                style={{
                  width: `${(item.sessions / max) * 100}%`,
                  background: `linear-gradient(90deg, ${deep}, ${bright})`,
                  boxShadow: `0 0 12px -2px ${bright}80`,
                }}
              />
            </div>
            <span className="w-8 shrink-0 text-right text-sm font-semibold tnum text-foreground">{item.sessions}</span>
          </div>
        );
      })}
    </div>
  );
}
