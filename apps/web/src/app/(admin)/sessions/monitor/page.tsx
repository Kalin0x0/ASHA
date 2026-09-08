'use client';

import type { WsServerEvent } from '@asha/events';
import { AppWindow, Eye, Radio, ScanEye } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/composite/empty-state';
import { Monogram } from '@/components/composite/monogram';
import { PageHeader } from '@/components/composite/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { SessionStatusPill } from '@/components/ui/status-pill';
import { useObservations, useSessions, useStartObservation, useStopObservation } from '@/lib/hooks';
import { DEFAULT_OBSERVE_INTERVAL, OBSERVE_INTERVALS, OBSERVE_RENEW_MS, OBSERVE_THUMB_WIDTH, degradedReason, formatAppClass, mergeObservation, observableSessions, resolveTilePreview, type ObservationSample, type ObserveInterval } from '@/lib/observation';
import { useRealtimeEvents } from '@/lib/realtime';
import type { SessionRow, SessionStatus } from '@/lib/types';
import { cn, formatDuration } from '@/lib/utils';

const STATUS_FILTERS: Array<SessionStatus | 'ALL'> = ['ALL', 'RUNNING', 'DEGRADED'];

/** One refused window — org policy, or a session that ended a moment ago — must
 *  not take the rest of the wall down with it; the tile explains itself. */
const ignoreWindowError = (): void => {};

/**
 * The live wall: one tile per running desktop, answering "who is doing what
 * right now" without opening any of them.
 *
 * Capture is demand-driven and honest about itself. While this page is open it
 * renews an observation window per visible tile; it closes every one of them on
 * unmount and whenever the tab goes to the background, and the people being
 * watched are told on their own screens for as long as it runs.
 */
export default function SessionMonitorPage() {
  const t = useTranslations('sessions.monitor');
  const tc = useTranslations('common');
  const router = useRouter();
  const sessions = useSessions();
  const polled = useObservations();
  const startObservation = useStartObservation();
  const stopObservation = useStopObservation();

  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<SessionStatus | 'ALL'>('ALL');
  const [intervalMs, setIntervalMs] = useState<ObserveInterval>(DEFAULT_OBSERVE_INTERVAL);
  const [backgrounded, setBackgrounded] = useState(false);
  const [streamed, setStreamed] = useState<Record<string, ObservationSample>>({});

  // Nothing is captured while the tab is hidden: an admin who switched away is
  // not watching, and capture that outlives attention is the thing this feature
  // must never do.
  useEffect(() => {
    const sync = () => setBackgrounded(document.visibilityState === 'hidden');
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, []);

  const capturing = intervalMs > 0 && !backgrounded;

  const live = useMemo(() => observableSessions(sessions), [sessions]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return live.filter((s) => {
      if (status !== 'ALL' && s.status !== status) return false;
      if (!q) return true;
      return (
        s.user.name.toLowerCase().includes(q) ||
        s.user.email.toLowerCase().includes(q) ||
        s.workspaceName.toLowerCase().includes(q) ||
        s.zone.toLowerCase().includes(q) ||
        s.agent.toLowerCase().includes(q)
      );
    });
  }, [live, query, status]);

  /**
   * Mint the watch token at the moment of the click, not when the tile opened:
   * it lives 120 s, and an admin who scrolls the wall for a while would
   * otherwise arrive at the desktop with an expired one and be refused. Doing
   * it here also puts the audit entry where the watching actually starts.
   */
  const watchLive = useCallback(
    async (sessionId: string) => {
      try {
        const win = await startObservation(sessionId, { intervalMs, thumbWidth: OBSERVE_THUMB_WIDTH });
        router.push(win.watchUrl);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t('watchFailed'));
      }
    },
    [startObservation, intervalMs, router, t],
  );

  // Only the tiles actually on screen are observed. Joined into a string so the
  // effects below re-run when the set changes, not on every list rebuild.
  const watchKey = useMemo(() => filtered.map((s) => s.id).join(','), [filtered]);
  const watched = useMemo(
    () => (capturing && watchKey ? watchKey.split(',') : []),
    [capturing, watchKey],
  );
  const watchedRef = useRef(watched);
  watchedRef.current = watched;

  // Windows currently open. Kept so a change to the search box only opens what
  // joined the wall and closes what left it — tearing every window down and
  // rebuilding it on each keystroke would write an audit pair per session per
  // character typed.
  const openWindows = useRef(new Set<string>());
  const stopRef = useRef(stopObservation);
  stopRef.current = stopObservation;

  useEffect(() => {
    const open = openWindows.current;
    const next = new Set(watched);
    for (const id of open) {
      if (next.has(id)) continue;
      open.delete(id);
      void stopRef.current(id).catch(ignoreWindowError);
    }
    // Every wanted tile is (re)opened, not only the new ones: the agent takes
    // its cadence from the last request it saw, so a changed interval has to
    // reach the sessions that were already being captured.
    for (const id of next) {
      open.add(id);
      void startObservation(id, { intervalMs, thumbWidth: OBSERVE_THUMB_WIDTH }).catch(ignoreWindowError);
    }
  }, [watched, intervalMs, startObservation]);

  useEffect(() => {
    if (!capturing) return;
    // The agent gives up 60s after the last request it saw, so windows are
    // renewed well inside that rather than once per captured frame — at the 3s
    // cadence that would be one POST per tile per frame for no added safety.
    const timer = window.setInterval(() => {
      for (const id of watchedRef.current) {
        void startObservation(id, { intervalMs, thumbWidth: OBSERVE_THUMB_WIDTH }).catch(ignoreWindowError);
      }
    }, OBSERVE_RENEW_MS);
    return () => window.clearInterval(timer);
  }, [capturing, intervalMs, startObservation]);

  // Leaving the page must never leave capture running. A hard close the browser
  // gives us no chance to react to is covered by the agent's dead-man switch.
  useEffect(() => {
    const open = openWindows.current;
    return () => {
      for (const id of open) void stopRef.current(id).catch(ignoreWindowError);
      open.clear();
    };
  }, []);

  // The socket is the fast path; the 8s poll behind `useObservations` keeps the
  // wall filled when it cannot connect.
  const onEvent = useCallback((event: WsServerEvent) => {
    if (event.type !== 'session.observation') return;
    setStreamed((current) => mergeObservation(current, event.payload));
  }, []);
  const realtime = useRealtimeEvents(onEvent);

  const samples = useMemo(() => {
    let merged: Record<string, ObservationSample> = {};
    for (const sample of polled) merged = mergeObservation(merged, sample);
    for (const sample of Object.values(streamed)) merged = mergeObservation(merged, sample);
    return merged;
  }, [polled, streamed]);

  const notice = backgrounded
    ? t('notice.hidden')
    : intervalMs === 0
      ? t('notice.off')
      : t('notice.observing', { count: watched.length, seconds: intervalMs / 1000 });

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <Badge variant="gold" className="tnum">
            {t('sessionCount', { count: filtered.length })}
          </Badge>
        }
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <Input
          placeholder={t('searchPlaceholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="lg:max-w-sm"
        />
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setStatus(f)}
              aria-pressed={status === f}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors ring-gold-focus',
                status === f
                  ? 'border-[rgba(212,175,55,0.4)] bg-gold-500/10 text-gold-300'
                  : 'border-border-subtle text-muted-foreground hover:text-foreground',
              )}
            >
              {f === 'ALL' ? tc('labels.all') : tc(`sessionStatus.${f}`)}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 lg:ms-auto">
          <span className="text-xs text-muted-foreground">{t('interval.label')}</span>
          {OBSERVE_INTERVALS.map((ms) => (
            <button
              key={ms}
              onClick={() => setIntervalMs(ms)}
              aria-pressed={intervalMs === ms}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium tnum transition-colors ring-gold-focus',
                intervalMs === ms
                  ? 'border-[rgba(212,175,55,0.4)] bg-gold-500/10 text-gold-300'
                  : 'border-border-subtle text-muted-foreground hover:text-foreground',
              )}
            >
              {ms === 0 ? t('interval.off') : t('interval.seconds', { seconds: ms / 1000 })}
            </button>
          ))}
        </div>
      </div>

      {/* The one place the admin can read what this page is doing on their
          behalf. Quiet, but never absent — a wall that hides its own capture
          state invites exactly the misuse the notice to the user guards against. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-border-subtle bg-[var(--surface-2)] px-3.5 py-2.5 text-xs">
        <span
          className={cn(
            'inline-flex items-center gap-2 font-medium',
            capturing ? 'text-gold-300' : 'text-muted-foreground',
          )}
        >
          <ScanEye className={cn('size-3.5', capturing && 'animate-pulse-ring')} />
          {notice}
        </span>
        <span className="inline-flex items-center gap-1.5 text-muted-foreground ms-auto">
          <Radio className={cn('size-3.5', realtime === 'open' ? 'text-success' : 'text-muted-foreground')} />
          {realtime === 'open' ? t('realtime.open') : t('realtime.polling')}
        </span>
      </div>

      {filtered.length === 0 ? (
        <Card elevation={1}>
          <EmptyState
            icon={AppWindow}
            title={live.length === 0 ? t('emptyTitle') : t('emptyFilteredTitle')}
            description={live.length === 0 ? t('emptyDescription') : t('emptyFilteredDescription')}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((session) => (
            <MonitorTile
              key={session.id}
              session={session}
              sample={samples[session.id]}
              capturing={capturing}
              onWatch={() => void watchLive(session.id)}
              onDetails={() => router.push(`/sessions/${session.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MonitorTile({
  session,
  sample,
  capturing,
  onWatch,
  onDetails,
}: {
  session: SessionRow;
  sample: ObservationSample | undefined;
  capturing: boolean;
  onWatch: () => void;
  onDetails: () => void;
}) {
  const t = useTranslations('sessions.monitor');
  const preview = resolveTilePreview({
    sample,
    capturing,
    connectionType: session.connectionType,
  });
  const blankReason =
    preview.kind === 'blank'
      ? preview.reason === 'degraded'
        ? t(`tile.degradedReason.${degradedReason(preview.detail ?? '').key}`, {
            tool: degradedReason(preview.detail ?? '').tool ?? '',
          })
        : t(`tile.${preview.reason}`)
      : '';
  const appClass = formatAppClass(sample?.appClass);
  const memPct = session.memLimitMb > 0 ? (session.memMb / session.memLimitMb) * 100 : 0;

  return (
    <Card elevation="glass" className="flex flex-col overflow-hidden">
      {/* The frame box is always laid out, filled or not, so tiles never jump
          as captures arrive. */}
      <div className="relative aspect-video w-full shrink-0 bg-anthracite-950">
        {preview.kind === 'frame' ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview.src}
            alt={session.workspaceName}
            className="absolute inset-0 size-full object-cover"
          />
        ) : (
          <>
            <div className="absolute inset-0 bg-grid opacity-40" />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center">
              <Monogram name={session.workspaceName} className="size-11 rounded-xl" />
              <p className="text-[11px] leading-snug text-muted-foreground">{blankReason}</p>
            </div>
          </>
        )}

        {preview.kind === 'frame' && (
          <span className="absolute start-2 top-2 inline-flex items-center gap-1.5 rounded-md glass px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-gold-300">
            <span className="size-1.5 rounded-full bg-success animate-pulse-ring" />
            {t('live')}
          </span>
        )}
        {sample?.windowCount !== undefined && (
          <span className="absolute end-2 top-2 rounded-md glass px-2 py-1 font-mono text-[10px] text-muted-foreground">
            {t('tile.windows', { count: sample.windowCount })}
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{session.user.name}</p>
            <p className="truncate text-xs text-muted-foreground">{session.user.email}</p>
          </div>
          <SessionStatusPill status={session.status} />
        </div>

        {/* The "what are they doing" line — the reason this wall exists. */}
        <div className="min-w-0 rounded-md border border-border-subtle bg-[color-mix(in_srgb,var(--surface-2)_55%,transparent)] px-2.5 py-2">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {t('tile.activeWindow')}
          </p>
          <div className="mt-1 flex items-center gap-2">
            <p
              // Window titles run long ("Angebot-2026-114.odt — LibreOffice
              // Writer"); the tile truncates, the tooltip keeps the whole thing.
              title={sample?.title}
              className={cn('min-w-0 flex-1 truncate text-xs', !sample?.title && 'text-muted-foreground')}
            >
              {sample?.title ?? t('tile.noWindow')}
            </p>
            {appClass && (
              <Badge variant="outline" className="max-w-[45%] shrink-0 truncate font-mono text-[10px]">
                {appClass}
              </Badge>
            )}
          </div>
        </div>

        <div className="space-y-1.5 text-xs text-muted-foreground">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate">{session.workspaceName}</span>
            <span className="shrink-0 tnum">{formatDuration(session.uptimeSec)}</span>
          </div>
          <Meter label="CPU" value={`${Math.round(session.cpuPct)}%`}>
            <Progress value={session.cpuPct} tone={session.cpuPct > 85 ? 'destructive' : 'gold'} />
          </Meter>
          <Meter
            label={t('tile.memory')}
            value={`${(session.memMb / 1024).toFixed(1)} / ${(session.memLimitMb / 1024).toFixed(0)} GB`}
          >
            <Progress value={memPct} tone={memPct > 85 ? 'destructive' : 'info'} />
          </Meter>
        </div>

        <div className="mt-auto flex items-center gap-2 pt-1">
          <Button variant="secondary" size="sm" className="flex-1" onClick={onWatch}>
            <Eye className="size-4" /> {t('tile.watch')}
          </Button>
          <Button variant="ghost" size="sm" onClick={onDetails}>
            {t('tile.details')}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function Meter({ label, value, children }: { label: string; value: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 shrink-0 truncate">{label}</span>
      <span className="min-w-0 flex-1">{children}</span>
      <span className="shrink-0 tnum">{value}</span>
    </div>
  );
}
