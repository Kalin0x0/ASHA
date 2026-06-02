'use client';

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { KpiSeriesPoint } from '@/lib/types';
import { cn } from '@/lib/utils';

export function AreaTrend({ data, height = 240 }: { data: KpiSeriesPoint[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id="areaGold" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#d4af37" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#d4af37" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="t" hide />
        <YAxis tick={{ fill: 'var(--color-anthracite-300)', fontSize: 11 }} axisLine={false} tickLine={false} width={36} />
        <Tooltip
          cursor={{ stroke: 'var(--color-gold-500)', strokeOpacity: 0.3 }}
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
          stroke="#d4af37"
          strokeWidth={2}
          fill="url(#areaGold)"
          animationDuration={600}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function RingGauge({
  value,
  label,
  size = 92,
  tone = 'gold',
}: {
  value: number;
  label?: string;
  size?: number;
  tone?: 'gold' | 'success' | 'warning' | 'destructive' | 'info';
}) {
  const stroke = {
    gold: '#d4af37',
    success: '#5fb88f',
    warning: '#e0a84a',
    destructive: '#d2685f',
    info: '#6a8fc4',
  }[tone];
  const r = (size - 10) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.min(100, Math.max(0, value));
  const offset = c - (pct / 100) * c;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-anthracite-700)" strokeWidth={6} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={stroke}
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="font-display text-lg font-medium tnum">{Math.round(pct)}%</span>
        {label && <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>}
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
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {items.map((item) => (
        <div key={item.name} className="flex items-center gap-3">
          <span className="w-28 shrink-0 truncate text-sm text-muted-foreground">{item.name}</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-anthracite-700">
            <div
              className="h-full rounded-full bg-gradient-to-r from-gold-600 to-gold-400 transition-all duration-700"
              style={{ width: `${(item.sessions / max) * 100}%` }}
            />
          </div>
          <span className="w-8 shrink-0 text-right text-sm font-medium tnum">{item.sessions}</span>
        </div>
      ))}
    </div>
  );
}
