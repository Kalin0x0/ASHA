'use client';

import { MousePointer2, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Shown to the person AT the desktop while an administrator is controlling it —
 * RustDesk-style support. Unlike the observation strip this is never optional
 * and never suppressible: control moves the user's own cursor, so it says who is
 * doing it, since when, and gives them a button to end it at any moment. Shared
 * control — the user keeps their own mouse and keyboard the whole time.
 */
export function SessionControlNotice({
  controllerName,
  since,
  onEnd,
  className,
}: {
  controllerName: string;
  since?: string;
  onEnd: () => void;
  className?: string;
}) {
  const t = useTranslations('viewer.control');
  const locale = useLocale();
  const at = since ? new Date(since) : null;
  const time = at && !Number.isNaN(at.getTime()) ? at.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) : '';

  return (
    <div
      role="status"
      className={cn(
        // Gold, not the info blue observation uses: control is a stronger state,
        // and the user should read the difference at a glance.
        'flex items-center gap-3 border-b border-gold-500/50 bg-gold-500/15 px-3 py-2 text-gold-200 backdrop-blur sm:px-4',
        className,
      )}
    >
      <span className="relative flex size-5 shrink-0 items-center justify-center">
        <span className="absolute inline-flex size-5 rounded-full bg-gold-500/25 animate-pulse-ring" />
        <MousePointer2 className="relative size-3.5" />
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate text-[13px] font-medium">{t('activeTitle', { name: controllerName })}</p>
        <p className="truncate text-[11px]">{time ? `${t('since', { time })} · ${t('activeHint')}` : t('activeHint')}</p>
      </div>
      <Button size="sm" variant="secondary" className="shrink-0" onClick={onEnd}>
        <X className="size-3.5" />
        {t('end')}
      </Button>
    </div>
  );
}

/**
 * The approval prompt (approve mode): the user is asked before an administrator
 * may take control. Blocking, centred, no way past it but a decision — control
 * is input into their live desktop, so it waits for a real yes.
 */
export function ControlRequestDialog({
  controllerName,
  onAllow,
  onDeny,
}: {
  controllerName: string;
  onAllow: () => void;
  onDeny: () => void;
}) {
  const t = useTranslations('viewer.control');
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="control-request-title"
      className="fixed inset-0 z-modal grid place-items-center bg-anthracite-950/80 p-4 backdrop-blur-sm motion-safe:animate-in motion-safe:fade-in"
    >
      <div className="w-full max-w-sm rounded-xl border border-border-subtle bg-[var(--surface-1)] p-6 shadow-2xl">
        <div className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-gold-500/10 text-gold-300">
            <MousePointer2 className="size-5" />
          </span>
          <h2 id="control-request-title" className="font-display text-lg font-medium">
            {t('requestTitle')}
          </h2>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{t('requestBody', { name: controllerName })}</p>
        <div className="mt-6 flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={onDeny}>
            {t('deny')}
          </Button>
          <Button size="sm" autoFocus onClick={onAllow}>
            {t('allow')}
          </Button>
        </div>
      </div>
    </div>
  );
}
