'use client';

import { Loader2, Pause, Play, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AppIcon } from '@/components/composite/app-icon';
import { useConfirm } from '@/components/ui/confirm';
import { useAuth } from '@/lib/api/auth-context';
import { CURRENT_USER } from '@/lib/current-user';
import { useLaunchableWorkspaces, usePauseSession, useResumeSession, useSessions, useTerminateSession } from '@/lib/hooks';
import { useThumbnails } from '@/lib/thumbnail-store';
import type { SessionRow, SessionStatus, Workspace } from '@/lib/types';
import { cn, formatDuration } from '@/lib/utils';

const ACTIVE: SessionStatus[] = ['RUNNING', 'DEGRADED', 'PROVISIONING', 'SCHEDULED', 'PAUSED'];
// Server-backed (guacd) sessions open the remote-desktop viewer; the rest the
// streaming (KasmVNC) viewer.
const GUAC = new Set(['RDP', 'VNC', 'SSH']);

/**
 * "Open Workspaces" — a Kasm-style panel of the user's live sessions, each with
 * a preview of how the desktop last looked plus Resume (reconnect), Stop (pause)
 * and Delete (terminate), so users hop back into a running desktop instead of
 * relaunching every time.
 *
 * `orientation="vertical"` renders the Kasm left-rail (cards stacked, full
 * width); `orientation="horizontal"` renders a scrollable strip (used on narrow
 * viewports where there is no left column).
 */
export function OpenSessions({
  orientation = 'horizontal',
  className,
}: {
  orientation?: 'vertical' | 'horizontal';
  className?: string;
}) {
  const t = useTranslations('portal');
  const tc = useTranslations('common');
  const confirm = useConfirm();
  const router = useRouter();
  const { user } = useAuth();
  const sessions = useSessions();
  const workspaces = useLaunchableWorkspaces();
  const thumbs = useThumbnails((s) => s.thumbs);
  const terminate = useTerminateSession();
  const pause = usePauseSession();
  const resume = useResumeSession();
  // Per-card in-flight action, so Stop/Delete show a spinner + disable instead
  // of looking inert while the mutation round-trips (cleared once the session
  // reflects the new state — see the effect below).
  const [busy, setBusy] = useState<Record<string, 'stop' | 'delete'>>({});

  // The signed-in identity. Live mode resolves it from the auth session; mock
  // mode (no login) falls back to the fixed seed user so the strip still works.
  // (This used to read CURRENT_USER unconditionally — in live mode that mock id
  // never matched any real session, so the panel rendered nothing.)
  const meId = user?.id ?? CURRENT_USER.id;

  const wsByName = useMemo(() => new Map(workspaces.map((w) => [w.friendlyName, w])), [workspaces]);
  const mine = useMemo(
    () => sessions.filter((s) => s.user.id === meId && ACTIVE.includes(s.status)),
    [sessions, meId],
  );

  // Drop the busy flag once the action has landed: a stopped session reaches
  // PAUSED, a deleted one leaves the active set entirely.
  useEffect(() => {
    setBusy((prev) => {
      const entries = Object.entries(prev);
      if (entries.length === 0) return prev;
      const next: Record<string, 'stop' | 'delete'> = {};
      let changed = false;
      for (const [id, action] of entries) {
        const s = mine.find((m) => m.id === id);
        const settled = action === 'stop' ? !s || s.status === 'PAUSED' : !s;
        if (settled) changed = true;
        else next[id] = action;
      }
      return changed ? next : prev;
    });
  }, [mine]);

  if (mine.length === 0) return null;

  const openViewer = (s: SessionRow) =>
    router.push(GUAC.has(s.connectionType) ? `/connect/${s.kasmId}` : `/session/${s.id}`);
  const onResume = (s: SessionRow) => {
    if (s.status === 'PAUSED') resume(s.id);
    openViewer(s);
  };
  const onStop = (s: SessionRow) => {
    setBusy((b) => ({ ...b, [s.id]: 'stop' }));
    pause(s.id);
    toast.success(t('mySessions.stoppedToast'));
  };
  const onDelete = async (s: SessionRow) => {
    if (
      !(await confirm({
        title: tc('confirm.title'),
        confirmLabel: tc('actions.terminate'),
        description: tc('confirm.description'),
      }))
    )
      return;
    setBusy((b) => ({ ...b, [s.id]: 'delete' }));
    terminate(s.id);
    toast.success(t('mySessions.endedToast'));
  };

  const vertical = orientation === 'vertical';

  return (
    <section className={className} aria-label={t('mySessions.title')}>
      <div className="mb-3 flex items-center gap-2">
        <span className="size-2 rounded-full bg-success animate-pulse-ring" />
        <h2 className="font-display text-sm font-semibold tracking-tight">{t('mySessions.title')}</h2>
        <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
          {mine.length}
        </span>
      </div>

      <div
        className={cn(
          vertical
            ? 'flex flex-col gap-3'
            : 'flex gap-4 overflow-x-auto pb-2 [scrollbar-width:thin]',
        )}
      >
        {mine.map((s) => {
          const ws = wsByName.get(s.workspaceName);
          return (
            <SessionCard
              key={s.id}
              session={s}
              workspace={ws}
              thumb={thumbs[s.kasmId] ?? (ws ? thumbs[ws.id] : undefined)}
              busy={busy[s.id]}
              vertical={vertical}
              onResume={onResume}
              onStop={onStop}
              onDelete={onDelete}
            />
          );
        })}
      </div>
    </section>
  );
}

function SessionCard({
  session: s,
  workspace: ws,
  thumb,
  busy,
  vertical,
  onResume,
  onStop,
  onDelete,
}: {
  session: SessionRow;
  workspace: Workspace | undefined;
  thumb: { dataUrl: string } | undefined;
  busy: 'stop' | 'delete' | undefined;
  vertical: boolean;
  onResume: (s: SessionRow) => void;
  onStop: (s: SessionRow) => void;
  onDelete: (s: SessionRow) => void;
}) {
  const t = useTranslations('portal');
  const tc = useTranslations('common');
  const running = s.status === 'RUNNING' || s.status === 'DEGRADED';
  const paused = s.status === 'PAUSED';
  const label = running
    ? tc('sessionStatus.RUNNING')
    : paused
      ? tc('sessionStatus.PAUSED')
      : t('mySessions.starting');

  return (
    <div
      className={cn(
        'group flex flex-col overflow-hidden rounded-xl border border-border-subtle bg-[var(--surface-1)] transition-all duration-200 hover:border-[rgba(212,175,55,0.35)] hover:shadow-[var(--shadow-ambient)]',
        vertical ? 'w-full' : 'w-[280px] shrink-0',
      )}
    >
      {/* Last-screen preview — click to jump back in */}
      <button
        type="button"
        onClick={() => onResume(s)}
        disabled={busy === 'delete'}
        aria-label={t('mySessions.resumeAria', { name: s.workspaceName })}
        className="relative block h-32 w-full overflow-hidden bg-anthracite-900 ring-gold-focus disabled:opacity-60"
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
      <div className="flex flex-col gap-2.5 p-3">
        <p className="truncate text-sm font-medium" title={s.workspaceName}>
          {s.workspaceName}
        </p>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onResume(s)}
            disabled={busy === 'delete'}
            aria-label={t('mySessions.resumeAria', { name: s.workspaceName })}
            className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg bg-gold-500/90 px-3 text-xs font-semibold text-anthracite-950 transition-colors hover:bg-gold-500 ring-gold-focus disabled:pointer-events-none disabled:opacity-50"
          >
            <Play className="size-3.5 fill-anthracite-950" />
            {t('mySessions.resume')}
          </button>
          {running && (
            <button
              type="button"
              onClick={() => onStop(s)}
              disabled={Boolean(busy)}
              aria-busy={busy === 'stop'}
              aria-label={t('mySessions.stopAria', { name: s.workspaceName })}
              title={t('mySessions.stop')}
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground/70 transition-colors hover:bg-secondary hover:text-foreground ring-gold-focus disabled:pointer-events-none disabled:opacity-50"
            >
              {busy === 'stop' ? <Loader2 className="size-4 animate-spin" /> : <Pause className="size-4" />}
            </button>
          )}
          <button
            type="button"
            onClick={() => void onDelete(s)}
            disabled={Boolean(busy)}
            aria-busy={busy === 'delete'}
            aria-label={t('mySessions.deleteAria', { name: s.workspaceName })}
            title={t('mySessions.delete')}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground/70 transition-colors hover:bg-destructive/15 hover:text-destructive ring-gold-focus disabled:pointer-events-none disabled:opacity-50"
          >
            {busy === 'delete' ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
