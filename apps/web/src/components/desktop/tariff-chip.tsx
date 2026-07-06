'use client';

import { Timer } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMyTariff } from '@/lib/hooks';
import { cn } from '@/lib/utils';

/**
 * Remaining-time chip for the OS shells' system tray. Shows how much of the
 * user's tariff time budget is left (e.g. "12h 22m"), turning amber when low.
 * Renders nothing when the user has no metered tariff (unlimited).
 */
export function TariffChip({ className }: { className?: string }) {
  const t = useTranslations('portal');
  const tariff = useMyTariff();
  if (!tariff || tariff.budgetMinutes == null) return null;

  const secs = Math.max(0, tariff.remainingSeconds);
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const label = h > 0 ? `${h}h ${m}m` : `${m}m`;
  const low = secs < 15 * 60;

  return (
    <span
      title={t('tariff.remainingTitle', { name: tariff.name })}
      aria-label={t('tariff.remainingTitle', { name: tariff.name })}
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium tabular-nums',
        low ? 'border-warning/40 bg-warning/10 text-warning' : 'border-border-subtle text-foreground/85',
        className,
      )}
    >
      <Timer className="size-3" aria-hidden />
      {label}
    </span>
  );
}
