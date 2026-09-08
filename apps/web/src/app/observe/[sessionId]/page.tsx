'use client';

import type { WsServerEvent } from '@asha/events';
import { AppWindow, ArrowLeft, Eye, Loader2, MonitorX } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ObservationNotice } from '@/components/composite/observation-notice';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getSessionConnection } from '@/lib/api/endpoints';
import { isLive } from '@/lib/api/mode';
import { useObservations, useSessions, useStartObservation, useStopObservation } from '@/lib/hooks';
import {
  NO_OBSERVATION_NOTICE,
  OBSERVE_LIVE_INTERVAL_MS,
  OBSERVE_LIVE_THUMB_WIDTH,
  OBSERVE_RENEW_MS,
  WINDOW_REFUSED,
  applyObservedPush,
  applyObservedRead,
  degradedReason,
  formatAppClass,
  mergeObservation,
  resolveLiveView,
  type ObservationCapability,
  type ObservationSample,
} from '@/lib/observation';
import { createWindowId } from '@/lib/observation-windows';
import { useRealtimeEvents } from '@/lib/realtime';
import { cn } from '@/lib/utils';

/** Releasing a window that has already gone — the session ended, the record
 *  lapsed — is nothing to report on the way out of the page. */
const ignoreWindowError = (): void => {};

/** How often the age of the newest frame is re-read, so "stalled" can appear
 *  without a frame having to arrive to trigger the render. */
const AGE_TICK_MS = 1_000;

/**
 * Read-only view of a CONTAINER session.
 *
 * A container desktop never travels through the connection-proxy — the browser
 * loads it from Traefik — and three attempts at giving an observer a route onto
 * the container itself each ended the same way, because a container label cannot
 * be rotated while the container runs: a viewer credential that outlived the
 * grant it was handed out for, then one that also opened the route that may
 * type, then one that was never minted at all.
 *
 * So the live view is the capture the agent is already taking for the wall, at a
 * higher rate and a full-size frame. It is read-only by construction — there is
 * no input channel to guard — it needs no credential, no cookie and no route,
 * and it travels over the socket this administrator is already authenticated on.
 *
 * The observation window is renewed for as long as this page is open and closed
 * when it is left: that window is both what makes the agent capture and what
 * puts the notice on the watched person's screen, so an admin who navigated here
 * from the wall cannot become invisible by leaving it.
 */
export default function ObserveSessionPage() {
  const params = useParams<{ sessionId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const t = useTranslations('viewer');
  // The agent reports a thin capture as a machine token, and the wall already
  // has the translated line for each one. Reading them from there keeps the two
  // surfaces saying the same thing about the same container.
  const td = useTranslations('sessions.monitor.tile.degradedReason');
  const sessionId = params?.sessionId ?? '';
  const sessions = useSessions();
  const startObservation = useStartObservation();
  const stopObservation = useStopObservation();

  // Which of this observer's holds this page carries. Whoever opened it minted
  // the hold before navigating, so a reload continues that one instead of
  // opening a second window on the same desktop.
  const [windowId] = useState(() => searchParams?.get('win') || createWindowId('view'));
  // What the API answered about capturing this session. Until it has, the page
  // waits rather than guessing — the protocol label does not say whether there
  // is an agent behind it.
  const [capability, setCapability] = useState<ObservationCapability>();
  const [streamed, setStreamed] = useState<Record<string, ObservationSample>>({});

  // The strip is shown here too, and it is built from the same two sources the
  // watched person's viewer uses: the push, and — because the push only fires
  // on the transition — the current watcher read back from the API on mount and
  // whenever the socket comes back.
  const [notice, setNotice] = useState(NO_OBSERVATION_NOTICE);
  const noticeRef = useRef(notice);
  noticeRef.current = notice;
  const observed = notice.observed;

  const onEvent = useCallback(
    (event: WsServerEvent) => {
      if (event.type === 'session.observation') {
        if (event.payload.sessionId !== sessionId) return;
        setStreamed((current) => mergeObservation(current, event.payload));
        return;
      }
      if (event.type !== 'session.observed' || event.payload.sessionId !== sessionId) return;
      setNotice((current) => applyObservedPush(current, event.payload));
    },
    [sessionId],
  );
  const realtime = useRealtimeEvents(onEvent, { sessionId, enabled: Boolean(sessionId) });
  const socketOpen = realtime === 'open';

  useEffect(() => {
    if (!isLive || !sessionId) return;
    let cancelled = false;
    const pushes = noticeRef.current.pushes;
    getSessionConnection(sessionId)
      .then((c) => {
        if (cancelled) return;
        setNotice((current) => applyObservedRead(current, sessionId, c.notice?.observedBy, pushes));
      })
      .catch(() => {
        // Refused for an observer who is not a system admin — the connection
        // route is owner-scoped — and their banner comes from the room replay
        // instead. No banner is the degraded mode either way.
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, socketOpen]);

  const session = sessions.find((s) => s.id === sessionId);
  const title = session?.workspaceName ?? t('observe.streamTitle');

  const stopRef = useRef(stopObservation);
  stopRef.current = stopObservation;

  // Nothing is captured while this tab is in the background — the rule the wall
  // already keeps, and this view is the expensive one: a 960 px frame every
  // 700 ms is roughly 0.8 of a core on the agent host and 53 kB/s off the uplink,
  // spent on a picture nobody is looking at.
  const [backgrounded, setBackgrounded] = useState(false);
  useEffect(() => {
    const sync = () => setBackgrounded(document.visibilityState === 'hidden');
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, []);

  // When this view last started asking for frames. The deadline for the first
  // one runs from here rather than from the mount, so time spent with the tab
  // hidden — when nothing was being captured — is not counted against the agent.
  const [waitingSince, setWaitingSince] = useState(() => Date.now());

  // The window this page holds asks for the live cadence, not the wall's: here
  // the capture IS the picture, so it is taken as fast as the container manages.
  useEffect(() => {
    if (!sessionId || backgrounded) return;
    let answered = false;
    const open = () =>
      void startObservation(
        sessionId,
        { intervalMs: OBSERVE_LIVE_INTERVAL_MS, thumbWidth: OBSERVE_LIVE_THUMB_WIDTH },
        windowId,
      )
        .then((win) => {
          answered = true;
          setCapability({ thumbnails: win.thumbnails, ...(win.reason ? { reason: win.reason } : {}) });
        })
        .catch(() => {
          // A refused RENEWAL must not tear the picture down: there is a frame
          // and a status line by then, and the status line is what says the
          // frames stopped. A refused FIRST window has neither — the session
          // ended, or the org switched observation off — and leaving that to the
          // spinner told the observer nothing at all.
          if (!answered) setCapability({ thumbnails: false, reason: WINDOW_REFUSED });
        });
    setWaitingSince(Date.now());
    open();
    const timer = window.setInterval(open, OBSERVE_RENEW_MS);
    return () => {
      window.clearInterval(timer);
      void stopRef.current(sessionId, windowId).catch(ignoreWindowError);
    };
  }, [sessionId, windowId, startObservation, backgrounded]);

  // The socket is the fast path. The poll behind it is what puts a picture up at
  // all when the socket cannot connect — slowly, and labelled stale, which still
  // beats an empty screen.
  const polled = useObservations();
  const sample = useMemo(() => {
    let merged: Record<string, ObservationSample> = {};
    for (const s of polled) if (s.sessionId === sessionId) merged = mergeObservation(merged, s);
    for (const s of Object.values(streamed)) merged = mergeObservation(merged, s);
    return merged[sessionId];
  }, [polled, streamed, sessionId]);

  // Frames stopping produces no event, so the age is re-read on a timer: without
  // it the status would sit on "live" over a picture that had frozen minutes ago.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), AGE_TICK_MS);
    return () => window.clearInterval(timer);
  }, []);

  // The newest sample that carried a picture. A pass that came back without one
  // — the grab killed inside a container under load — must not take the desktop
  // off the screen: the age of this frame is what says the picture stopped.
  const frameRef = useRef<ObservationSample | undefined>(undefined);
  if (sample?.image) frameRef.current = sample;

  const view = resolveLiveView({ sample, frame: frameRef.current, capability, waitingSince, now });
  const appClass = formatAppClass(sample?.appClass);
  const degraded = view.status === 'degraded' ? degradedReason(view.detail ?? '') : undefined;

  const back = () => router.push('/sessions/monitor');

  return (
    <div className="fixed inset-0 z-viewer flex flex-col bg-anthracite-950 text-foreground">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border-subtle bg-[var(--surface-1)] px-2 sm:px-3">
        <Button variant="ghost" size="icon-sm" onClick={back} aria-label={t('observe.back')} className="shrink-0 rtl:rotate-180">
          <ArrowLeft className="size-4" />
        </Button>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-semibold text-foreground">{title}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {session ? `${session.user.name} · ${t('observe.subtitle')}` : t('observe.subtitle')}
          </p>
        </div>
        <span className="ms-1 inline-flex shrink-0 items-center gap-1.5 rounded-full border border-info/40 bg-info/10 px-2.5 py-1 text-[11px] font-medium text-info">
          <Eye className="size-3.5" /> {t('connect.toolbar.viewOnly')}
        </span>
      </header>

      {/* The same strip the watched person sees, on the watcher's screen too:
          observation that is announced on one side and invisible on the other
          is how it stops being announced at all. */}
      {observed && <ObservationNotice observed={observed} />}

      {/* The frame box is laid out whether or not a frame has arrived, so the
          picture appearing does not shift anything under it. */}
      <div className="flex min-h-0 flex-1 items-center justify-center p-2 sm:p-4">
        {view.src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={view.src}
            alt={title}
            className={cn(
              'max-h-full max-w-full rounded-lg border border-border-subtle object-contain transition-opacity',
              view.status === 'stalled' && 'opacity-50',
            )}
          />
        ) : view.status === 'unavailable' || degraded ? (
          <div className="flex flex-col items-center gap-3 px-6 text-center">
            <MonitorX className="size-9 text-muted-foreground" />
            <p className="font-display text-lg">{t('observe.unavailableTitle')}</p>
            <p className="max-w-md text-sm text-muted-foreground">
              {degraded
                ? td(degraded.key, { tool: degraded.tool ?? '' })
                : capability?.reason === WINDOW_REFUSED
                  ? t('observe.refusedDescription')
                  : t('observe.unavailableDescription')}
            </p>
            <Button variant="secondary" size="sm" onClick={back} className="mt-1">
              {t('observe.backToMonitor')}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="size-6 animate-spin text-gold-400" />
            <p className="text-sm text-muted-foreground">{t('observe.connecting')}</p>
          </div>
        )}
      </div>

      {/* What is on the screen, and whether the picture is still moving — both
          in view at once, because a frozen desktop with no label reads as a
          quiet user rather than a stopped capture. */}
      <footer className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-border-subtle bg-[var(--surface-1)] px-3 py-2 text-xs">
        <span
          className={cn(
            'inline-flex shrink-0 items-center gap-1.5 font-medium',
            view.status === 'live' ? 'text-gold-300' : 'text-muted-foreground',
          )}
        >
          <span
            className={cn(
              'size-1.5 rounded-full',
              view.status === 'live' ? 'bg-success animate-pulse-ring' : 'bg-muted-foreground',
            )}
          />
          {t(`observe.status.${view.status}`)}
        </span>
        <span className="inline-flex min-w-0 flex-1 items-center gap-2">
          <AppWindow className="size-3.5 shrink-0 text-muted-foreground" />
          <span
            // Window titles run long ("Angebot-2026-114.odt — LibreOffice
            // Writer"); the bar truncates, the tooltip keeps the whole thing.
            title={sample?.title}
            className={cn('min-w-0 truncate', !sample?.title && 'text-muted-foreground')}
          >
            {sample?.title ?? t('observe.noWindow')}
          </span>
          {appClass && (
            <Badge variant="outline" className="shrink-0 font-mono text-[10px]">
              {appClass}
            </Badge>
          )}
        </span>
        <span className="shrink-0 text-muted-foreground">
          {realtime === 'open' ? t('observe.realtime.open') : t('observe.realtime.polling')}
        </span>
      </footer>
    </div>
  );
}
