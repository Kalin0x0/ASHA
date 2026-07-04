'use client';

import { motion } from 'framer-motion';
import { Loader2, Play } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AppIcon } from '@/components/composite/app-icon';
import { LiquidGlass } from '@/components/ui/liquid-glass';
import { useConfirm } from '@/components/ui/confirm';
import { useAuth } from '@/lib/api/auth-context';
import { CURRENT_USER } from '@/lib/current-user';
import {
  useLaunchableWorkspaces,
  usePauseSession,
  useResumeSession,
  useSessions,
  useTerminateSession,
} from '@/lib/hooks';
import { useThumbnails } from '@/lib/thumbnail-store';
import type { SessionRow, SessionStatus, Workspace } from '@/lib/types';
import { cn, formatDuration } from '@/lib/utils';

const ACTIVE: SessionStatus[] = ['RUNNING', 'DEGRADED', 'PROVISIONING', 'SCHEDULED', 'PAUSED'];
const GUAC = new Set(['RDP', 'VNC', 'SSH']);

/** The signed-in user's ACTIVE sessions — shared by the desktop + dock. */
export function useMySessions(): SessionRow[] {
  const { user } = useAuth();
  const sessions = useSessions();
  const meId = user?.id ?? CURRENT_USER.id;
  return useMemo(
    () => sessions.filter((s) => s.user.id === meId && ACTIVE.includes(s.status)),
    [sessions, meId],
  );
}

/** Route to the right viewer for a session (guacd protocols vs KasmVNC). */
export function sessionViewerPath(s: SessionRow): string {
  return GUAC.has(s.connectionType) ? `/connect/${s.kasmId}` : `/session/${s.id}`;
}

/**
 * The user's open sessions rendered as macOS-style windows on the desktop —
 * titlebar with working traffic lights (close = end, minimize = pause,
 * zoom = open), the last-screen preview as the window content.
 */
export function SessionWindows({ sessions }: { sessions: SessionRow[] }) {
  const t = useTranslations('portal');
  const tc = useTranslations('common');
  const confirm = useConfirm();
  const router = useRouter();
  const workspaces = useLaunchableWorkspaces();
  const thumbs = useThumbnails((s) => s.thumbs);
  const terminate = useTerminateSession();
  const pause = usePauseSession();
  const resume = useResumeSession();
  const [busy, setBusy] = useState<Record<string, 'stop' | 'delete'>>({});

  const wsByName = useMemo(() => new Map(workspaces.map((w) => [w.friendlyName, w])), [workspaces]);

  // Drop the busy flag once the action has landed: a paused session reaches
  // PAUSED, an ended one leaves the active set entirely.
  useEffect(() => {
    setBusy((prev) => {
      const entries = Object.entries(prev);
      if (entries.length === 0) return prev;
      const next: Record<string, 'stop' | 'delete'> = {};
      let changed = false;
      for (const [id, action] of entries) {
        const s = sessions.find((m) => m.id === id);
        const settled = action === 'stop' ? !s || s.status === 'PAUSED' : !s;
        if (settled) changed = true;
        else next[id] = action;
      }
      return changed ? next : prev;
    });
  }, [sessions]);

  const onOpen = (s: SessionRow) => {
    if (s.status === 'PAUSED') resume(s.id);
    router.push(sessionViewerPath(s));
  };
  const onPause = (s: SessionRow) => {
    setBusy((b) => ({ ...b, [s.id]: 'stop' }));
    pause(s.id);
    toast.success(t('mySessions.stoppedToast'));
  };
  const onClose = async (s: SessionRow) => {
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

  return (
    <div className="flex flex-wrap justify-center gap-5">
      {sessions.map((s, i) => {
        const ws = wsByName.get(s.workspaceName);
        return (
          <motion.div
            key={s.id}
            initial={{ opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: Math.min(i * 0.05, 0.3), duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            <SessionWindow
              session={s}
              workspace={ws}
              thumb={thumbs[s.kasmId] ?? (ws ? thumbs[ws.id] : undefined)}
              busy={busy[s.id]}
              onOpen={onOpen}
              onPause={onPause}
              onClose={onClose}
            />
          </motion.div>
        );
      })}
    </div>
  );
}

function SessionWindow({
  session: s,
  workspace: ws,
  thumb,
  busy,
  onOpen,
  onPause,
  onClose,
}: {
  session: SessionRow;
  workspace: Workspace | undefined;
  thumb: { dataUrl: string } | undefined;
  busy: 'stop' | 'delete' | undefined;
  onOpen: (s: SessionRow) => void;
  onPause: (s: SessionRow) => void;
  onClose: (s: SessionRow) => void;
}) {
  const t = useTranslations('portal');
  const tc = useTranslations('common');
  const running = s.status === 'RUNNING' || s.status === 'DEGRADED';
  const paused = s.status === 'PAUSED';
  const statusLabel = running
    ? tc('sessionStatus.RUNNING')
    : paused
      ? tc('sessionStatus.PAUSED')
      : t('mySessions.starting');

  return (
    <LiquidGlass
      radius="rounded-xl"
      sheen={false}
      tint="var(--glass-tint-strong)"
      className="group w-[320px] border border-white/12 transition-colors duration-200 hover:border-[rgba(212,175,55,0.4)] sm:w-[360px]"
    >
      {/* Titlebar — traffic lights + centered title + uptime; transparent so the
          liquid glass refracts the wallpaper through it. */}
      <div dir="ltr" className="relative flex h-9 items-center gap-2 border-b border-white/10 px-3">
        <div className="flex items-center gap-1.5">
          <TrafficLight
            color="close"
            label={t('desktop.windows.closeAria', { name: s.workspaceName })}
            busy={busy === 'delete'}
            disabled={Boolean(busy)}
            onClick={() => void onClose(s)}
          />
          <TrafficLight
            color="minimize"
            label={t('desktop.windows.minimizeAria', { name: s.workspaceName })}
            busy={busy === 'stop'}
            disabled={!running || Boolean(busy)}
            onClick={() => onPause(s)}
          />
          <TrafficLight
            color="zoom"
            label={t('desktop.windows.zoomAria', { name: s.workspaceName })}
            disabled={busy === 'delete'}
            onClick={() => onOpen(s)}
          />
        </div>
        <span className="pointer-events-none absolute inset-x-16 truncate text-center text-xs font-medium text-foreground/90">
          {s.workspaceName}
        </span>
        {running && (
          <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">
            {formatDuration(s.uptimeSec)}
          </span>
        )}
      </div>

      {/* Window content — the last-screen preview; click to jump back in */}
      <button
        type="button"
        onClick={() => onOpen(s)}
        disabled={busy === 'delete'}
        aria-label={t('mySessions.resumeAria', { name: s.workspaceName })}
        className="relative block h-44 w-full overflow-hidden bg-anthracite-900 outline-none ring-gold-focus disabled:opacity-60"
      >
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumb.dataUrl}
            alt=""
            aria-hidden
            className={cn(
              'size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]',
              paused && 'brightness-50 grayscale',
            )}
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

        {/* Status chip */}
        <span className="on-dark absolute start-2 top-2 inline-flex items-center gap-1 rounded-full bg-anthracite-950/70 px-2 py-0.5 text-[10px] font-medium backdrop-blur">
          <span
            className={cn(
              'size-1.5 rounded-full',
              running ? 'bg-success animate-pulse-ring' : paused ? 'bg-muted-foreground' : 'bg-warning',
            )}
          />
          {statusLabel}
        </span>

        {/* Hover hint */}
        <span className="absolute inset-0 flex items-center justify-center bg-anthracite-950/40 opacity-0 backdrop-blur-[1px] transition-opacity group-hover:opacity-100">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-gold-500 px-3 py-1 text-xs font-semibold text-anthracite-950">
            <Play className="size-3.5 fill-anthracite-950" aria-hidden /> {t('mySessions.resume')}
          </span>
        </span>
      </button>
    </LiquidGlass>
  );
}

/** A macOS traffic-light button: colored dot, glyph on titlebar hover. */
function TrafficLight({
  color,
  label,
  onClick,
  disabled = false,
  busy = false,
}: {
  color: 'close' | 'minimize' | 'zoom';
  label: string;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
}) {
  const palette = {
    close: 'bg-[#ff5f57] border-[#e0443e]',
    minimize: 'bg-[#febc2e] border-[#d89e24]',
    zoom: 'bg-[#28c840] border-[#1faf34]',
  }[color];
  const glyph = { close: '×', minimize: '−', zoom: '+' }[color];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-busy={busy}
      aria-label={label}
      title={label}
      className={cn(
        'flex size-3 items-center justify-center rounded-full border text-[9px] font-bold leading-none text-black/0 outline-none transition-all ring-gold-focus group-hover:text-black/60',
        palette,
        disabled && !busy && 'opacity-40 saturate-50',
        busy && 'animate-pulse',
      )}
    >
      {busy ? '' : glyph}
    </button>
  );
}
