'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export function Progress({
  value = 0,
  className,
  indicatorClassName,
  tone = 'gold',
}: {
  value?: number;
  className?: string;
  indicatorClassName?: string;
  tone?: 'gold' | 'success' | 'warning' | 'destructive' | 'info';
}) {
  const toneClass = {
    gold: 'bg-gradient-to-r from-gold-600 to-gold-400',
    success: 'bg-success',
    warning: 'bg-warning',
    destructive: 'bg-destructive',
    info: 'bg-info',
  }[tone];

  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-anthracite-700', className)}>
      <div
        className={cn('h-full rounded-full transition-all duration-500 ease-out', toneClass, indicatorClassName)}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}
