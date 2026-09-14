'use client';

import type { SessionObservedEvent } from '@asha/events';
import { ChevronDown, Eye } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

/** How long the full strip stays before it shrinks to the corner indicator. */
const AUTO_MINIMIZE_MS = 6000;

/**
 * Addressed to the person AT the desktop, not the observer: an administrator is
 * watching this session, who they are, and since when.
 *
 * It announces in full, then shrinks on its own to a small pulsing indicator in
 * the corner so it stops covering the top of the desktop while the user works —
 * it can be reopened, and it never disappears entirely, because being told is
 * what makes observation lawful here. A new observer re-opens the full strip,
 * since a fresh person watching is worth saying out loud again.
 */
export function ObservationNotice({
  observed,
  className,
}: {
  observed: SessionObservedEvent;
  className?: string;
}) {
  const t = useTranslations('viewer.observed');
  const locale = useLocale();
  const [minimized, setMinimized] = useState(false);

  useEffect(() => {
    setMinimized(false);
    const id = setTimeout(() => setMinimized(true), AUTO_MINIMIZE_MS);
    return () => clearTimeout(id);
  }, [observed.observerName, observed.since]);

  const since = new Date(observed.since);
  const time = Number.isNaN(since.getTime())
    ? ''
    : since.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });

  if (minimized) {
    // The container keeps its position but is click-through, so only the pill —
    // top corner, clear of the browser tabs below — sits over the desktop, and
    // everything else is the live screen again.
    return (
      <div className={cn('pointer-events-none flex justify-end p-1.5', className)}>
        <button
          type="button"
          onClick={() => setMinimized(false)}
          aria-label={t('title')}
          className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-info/40 bg-info/15 px-2.5 py-1 text-info shadow-sm backdrop-blur"
        >
          <span className="relative flex size-3.5 items-center justify-center">
            <span className="absolute inline-flex size-3.5 rounded-full bg-info/30 animate-pulse-ring" />
            <Eye className="relative size-3" />
          </span>
          <span className="text-[11px] font-medium">{t('short')}</span>
        </button>
      </div>
    );
  }

  return (
    <div
      role="status"
      className={cn(
        'flex items-center gap-3 border-b border-info/40 bg-info/10 px-3 py-2 text-info backdrop-blur sm:px-4',
        className,
      )}
    >
      <span className="relative flex size-5 shrink-0 items-center justify-center">
        <span className="absolute inline-flex size-5 rounded-full bg-info/25 animate-pulse-ring" />
        <Eye className="relative size-3.5" />
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate text-[13px] font-medium">{t('title')}</p>
        <p className="truncate text-[11px]">
          {t('by', { name: observed.observerName, time })} · {t('hint')}
        </p>
      </div>
      <button
        type="button"
        onClick={() => setMinimized(true)}
        aria-label={t('minimize')}
        className="shrink-0 rounded p-1 text-info/80 transition-colors hover:bg-info/15 hover:text-info"
      >
        <ChevronDown className="size-4" />
      </button>
    </div>
  );
}
