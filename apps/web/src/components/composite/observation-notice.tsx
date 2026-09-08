'use client';

import type { SessionObservedEvent } from '@asha/events';
import { Eye } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

/**
 * Addressed to the person AT the desktop, not to the observer: an administrator
 * is watching this session, who they are, and since when.
 *
 * It carries no close button on purpose. Telling the observed user is what makes
 * observation lawful in this deployment, so the strip stays for as long as
 * somebody is watching — it disappears only when the API says the last observer
 * has left.
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
  const since = new Date(observed.since);
  const time = Number.isNaN(since.getTime())
    ? ''
    : since.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });

  return (
    <div
      role="status"
      className={cn(
        // Same info accent the viewers already use for their view-only chip, so
        // the strip belongs to the chrome instead of shouting over it.
        'flex items-center gap-3 border-b border-info/40 bg-info/10 px-3 py-2 text-info backdrop-blur sm:px-4',
        className,
      )}
    >
      <span className="relative flex size-5 shrink-0 items-center justify-center">
        <span className="absolute inline-flex size-5 rounded-full bg-info/25 animate-pulse-ring" />
        <Eye className="relative size-3.5" />
      </span>
      <div className="min-w-0 leading-tight">
        <p className="truncate text-[13px] font-medium">{t('title')}</p>
        <p className="truncate text-[11px]">
          {t('by', { name: observed.observerName, time })} · {t('hint')}
        </p>
      </div>
    </div>
  );
}
