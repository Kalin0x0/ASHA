'use client';

import { Pause, Play, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { toast } from 'sonner';
import { AppIcon } from '@/components/composite/app-icon';
import { CURRENT_USER } from '@/lib/current-user';
import { usePauseSession, useResumeSession, useSessions, useTerminateSession, useWorkspaces } from '@/lib/hooks';
import { useThumbnails } from '@/lib/thumbnail-store';
import type { SessionRow, SessionStatus } from '@/lib/types';
import { cn, formatDuration } from '@/lib/utils';

const ACTIVE: SessionStatus[] = ['RUNNING', 'DEGRADED', 'PROVISIONING', 'SCHEDULED', 'PAUSED'];
// Server-backed (guacd) sessions open the remote-desktop viewer; the rest the
// streaming (KasmVNC) viewer.
const GUAC = new Set(['RDP', 'VNC', 'SSH']);

/**
 * "My Sessions" — a Kasm-style running-desktop switcher at the top of the
 * launcher. Each live session the user owns shows a thumbnail of how the desktop
 * last looked plus Stop (pause), Resume (reconnect) and Delete (terminate), so
 * users hop back into a running desktop instead of relaunching every time.
 */
export function MySessionsStrip() {
  const t = useTranslations('portal');
  const tc = useTranslations('common');
  const router = useRouter();
  const sessions = useSessions();
  const workspaces = useWorkspaces();
  const thumbs = useThumbnails((s) => s.thumbs);
  const terminate = useTerminateSession();
  const pause = usePauseSession();
  const resume = useResumeSession();

  const wsByName = useMemo(() => new Map(workspaces.map((w) => [w.friendlyName, w])), [workspaces]);
  const mine = useMemo(
    () => sessions.filter((s) => s.user.id === CURRENT_USER.id && ACTIVE.includes(s.status)),
    [sessions],
  );

  if (mine.length === 0) return null;

  const openViewer = (s: SessionRow) =>
    router.push(GUAC.has(s.connectionType) ? `/connect/${s.kasmId}` : `/session/${s.id}`);
  const onResume = (s: SessionRow) => {
    if (s.status === 'PAUSED') resume(s.id);
    openViewer(s);
  };
  const onStop = (s: SessionRow) => {
    pause(s.id);
    toast.success(t('mySessions.stoppedToast'));
  };
  const onDelete = (s: SessionRow) => {
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
          const ws = wsByName.get(s.workspaceName);
          const thumb = ws ? thumbs[ws.id] : undefined;
          const running = s.status === 'RUNNING' || s.status === 'DEGRADED';
          const paused = s.status === 'PAUSED';
          const label = running
            ? tc('sessionStatus.RUNNING')
            : paused
              ? tc('sessionStatus.PAUSED')
              : t('mySessions.starting');
          return (
            <div
              key={s.id}
              className="group flex w-[280px] shrink-0 flex-col overflow-hidden rounded-xl border border-border-subtle bg-[var(--surface-1)] transition-all duration-200 hover:border-[rgba(212,175,55,0.35)] hover:shadow-[var(--shadow-ambient)]"
            >
              {/* Last-screen preview */}
              <button
                type="button"
                onClick={() => onResume(s)}
                aria-label={t('mySessions.resumeAria', { name: s.workspaceName })}
                className="relative block h-32 w-full overflow-hidden bg-anthracite-900 ring-gold-focus"
              >
                {thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={thumb.dataUrl}
                    alt=""
                    aria-hidden
                    className={cn('size-full object-cover transition-all duration-300 group-hover:scale-105', paused && 'brightness-50 grayscale')}
                  />
                ) : (
                  <span className="flex size-full items-center justify-center bg-[radial-gradient(120%_120%_at_50%_0%,#23234a,#14141f)]">
                    <AppIcon
                      name={s.workspaceName}
                      dockerImage={ws?.dockerImage}
                      category={ws?.category}
                      iconUrl={ws?.iconUrl}
                      rounded="rounded-xl"
                      className="size-12"
                    />
                  </span>
                )}
                {/* Status badge */}
                <span className="on-dark absolute start-2 top-2 inline-flex items-center gap-1 rounded-full bg-anthracite-950/70 px-2 py-0.5 text-[10px] font-medium backdrop-blur">
                  <span className={cn('size-1.5 rounded-full', running ? 'bg-success animate-pulse-ring' : paused ? 'bg-muted-foreground' : 'bg-warning')} />
                  {label}
                  {running && <span className="tabular-nums text-muted-foreground">· {formatDuration(s.uptimeSec)}</span>}
                </span>
                {/* Hover hint */}
                <span className="absolute inset-0 flex items-center justify-center bg-anthracite-950/40 opacity-0 backdrop-blur-[1px] transition-opacity group-hover:opacity-100">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-gold-500 px-3 py-1 text-xs font-semibold text-anthracite-950">
                    <Play className="size-3.5 fill-anthracite-950" /> {t('mySessions.resume')}
                  </span>
                </span>
              </button>

              {/* Meta + controls */}
              <div className="flex items-center gap-2 p-3">
                <p className="min-w-0 flex-1 truncate text-sm font-medium">{s.workspaceName}</p>
                <div className="flex shrink-0 items-center gap-1">
                  {running && (
                    <button
                      type="button"
                      onClick={() => onStop(s)}
                      aria-label={t('mySessions.stopAria', { name: s.workspaceName })}
                      title={t('mySessions.stop')}
                      className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground/70 transition-colors hover:bg-secondary hover:text-foreground ring-gold-focus"
                    >
                      <Pause className="size-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onResume(s)}
                    aria-label={t('mySessions.resumeAria', { name: s.workspaceName })}
                    title={t('mySessions.resume')}
                    className="inline-flex size-8 items-center justify-center rounded-lg bg-gold-500/90 text-anthracite-950 transition-colors hover:bg-gold-500 ring-gold-focus"
                  >
                    <Play className="size-4 fill-anthracite-950" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(s)}
                    aria-label={t('mySessions.deleteAria', { name: s.workspaceName })}
                    title={t('mySessions.delete')}
                    className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground/70 transition-colors hover:bg-destructive/15 hover:text-destructive ring-gold-focus"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
