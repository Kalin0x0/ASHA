'use client';

import { Play, Power } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { toast } from 'sonner';
import { Monogram } from '@/components/composite/monogram';
import { CURRENT_USER } from '@/lib/current-user';
import { useSessions, useTerminateSession } from '@/lib/hooks';
import type { SessionRow, SessionStatus } from '@/lib/types';
import { cn, formatDuration } from '@/lib/utils';

const ACTIVE: SessionStatus[] = ['RUNNING', 'DEGRADED', 'PROVISIONING', 'SCHEDULED', 'PAUSED'];

function statusMeta(status: SessionStatus): { statusKey: 'RUNNING' | 'PAUSED' | null; tone: string } {
  switch (status) {
    case 'RUNNING':
    case 'DEGRADED':
      return { statusKey: 'RUNNING', tone: 'text-success' };
    case 'PAUSED':
      return { statusKey: 'PAUSED', tone: 'text-muted-foreground' };
    default:
      return { statusKey: null, tone: 'text-warning' };
  }
}

/**
 * "My Sessions" — the resume strip at the top of the launcher. Mirrors Kasm's
 * running-sessions row: every live session the current user owns, with one-click
 * resume (re-opens the streaming viewer) and end controls.
 */
export function MySessionsStrip() {
  const t = useTranslations('portal');
  const tc = useTranslations('common');
  const router = useRouter();
  const sessions = useSessions();
  const terminate = useTerminateSession();

  const mine = useMemo(
    () =>
      sessions.filter(
        (s) => s.user.id === CURRENT_USER.id && ACTIVE.includes(s.status),
      ),
    [sessions],
  );

  if (mine.length === 0) return null;

  const resume = (s: SessionRow) => router.push(`/session/${s.id}`);
  const end = (s: SessionRow) => {
    terminate(s.id);
    toast.success(t('mySessions.endedToast'));
  };

  return (
    <section>
      <div className="mb-4 flex items-center gap-2">
        <span className="size-2 rounded-full bg-success animate-pulse-ring" />
        <h2 className="font-display text-lg font-semibold">{t('mySessions.title')}</h2>
        <span className="text-xs text-muted-foreground">({mine.length})</span>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-2 [scrollbar-width:thin]">
        {mine.map((s) => {
          const { statusKey, tone } = statusMeta(s.status);
          const label = statusKey ? tc(`sessionStatus.${statusKey}`) : t('mySessions.starting');
          const running = s.status === 'RUNNING' || s.status === 'DEGRADED';
          return (
            <div
              key={s.id}
              className="group flex w-[280px] shrink-0 items-center gap-3 rounded-xl border border-border-subtle bg-[var(--surface-1)] p-3 transition-all duration-200 hover:border-[rgba(212,175,55,0.35)] hover:shadow-[var(--shadow-ambient)]"
            >
              <Monogram name={s.workspaceName} className="size-11 rounded-xl" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{s.workspaceName}</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className={cn('inline-flex items-center gap-1', tone)}>
                    <span className={cn('size-1.5 rounded-full', running ? 'bg-success' : s.status === 'PAUSED' ? 'bg-muted-foreground' : 'bg-warning')} />
                    {label}
                  </span>
                  {running && <span className="tabular-nums">· {formatDuration(s.uptimeSec)}</span>}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => resume(s)}
                  aria-label={t('mySessions.resumeAria', { name: s.workspaceName })}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-gold-500/90 px-2.5 text-xs font-semibold text-anthracite-950 transition-colors hover:bg-gold-500 ring-gold-focus"
                >
                  <Play className="size-3.5 fill-anthracite-950" /> {t('mySessions.resume')}
                </button>
                <button
                  type="button"
                  onClick={() => end(s)}
                  aria-label={t('mySessions.endAria', { name: s.workspaceName })}
                  className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground/60 transition-colors hover:bg-destructive/15 hover:text-destructive ring-gold-focus"
                >
                  <Power className="size-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
