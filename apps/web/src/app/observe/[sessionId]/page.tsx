'use client';

import { ArrowLeft, Eye, Loader2, MonitorX } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ObservationNotice } from '@/components/composite/observation-notice';
import { Button } from '@/components/ui/button';
import { getSessionConnection } from '@/lib/api/endpoints';
import { isLive } from '@/lib/api/mode';
import { useSessions, useStartObservation, useStopObservation } from '@/lib/hooks';
import {
  NO_OBSERVATION_NOTICE,
  OBSERVE_RENEW_MS,
  OBSERVE_THUMB_WIDTH,
  applyObservedPush,
  applyObservedRead,
  isObserveStreamUrl,
} from '@/lib/observation';
import { createWindowId } from '@/lib/observation-windows';
import { useRealtimeEvents } from '@/lib/realtime';

/** A refused renewal — the session ended, or policy changed under us — must not
 *  tear the picture down; the stream itself says when it is gone. */
const ignoreWindowError = (): void => {};

/**
 * Read-only view of a CONTAINER session.
 *
 * A container desktop never travels through the connection-proxy: the browser
 * loads it from Traefik, so there is no server-side instruction filter to lean
 * on and `/connect/<kasmId>` would only render a dead viewer. What makes this
 * view harmless instead is the credential — the API hands out the session's
 * `/observe` route, which the agent labelled with KasmVNC's `kasm_viewer`
 * account (write:false), so the desktop refuses input from here whatever the
 * embedded client tries to send.
 *
 * The observation window is renewed for as long as this page is open and closed
 * when it is left, because that window is what puts the notice on the watched
 * person's screen — an admin who navigated here from the wall must not become
 * invisible by leaving it.
 */
export default function ObserveSessionPage() {
  const params = useParams<{ sessionId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const t = useTranslations('viewer');
  const sessionId = params?.sessionId ?? '';
  const sessions = useSessions();
  const startObservation = useStartObservation();
  const stopObservation = useStopObservation();
  const [ready, setReady] = useState(false);

  const src = searchParams?.get('src') ?? '';
  const stream = useMemo(() => (isObserveStreamUrl(src) ? src : null), [src]);
  // Which of this observer's holds this page carries. Whoever opened it minted
  // the hold before navigating, so a reload continues that one instead of
  // opening a second window on the same desktop.
  const [windowId] = useState(() => searchParams?.get('win') || createWindowId('view'));

  // The strip is shown here too, and it is built from the same two sources the
  // watched person's viewer uses: the push, and — because the push only fires
  // on the transition — the current watcher read back from the API on mount and
  // whenever the socket comes back.
  const [notice, setNotice] = useState(NO_OBSERVATION_NOTICE);
  const noticeRef = useRef(notice);
  noticeRef.current = notice;
  const observed = notice.observed;
  const realtime = useRealtimeEvents(
    (event) => {
      if (event.type !== 'session.observed' || event.payload.sessionId !== sessionId) return;
      setNotice((current) => applyObservedPush(current, event.payload));
    },
    { sessionId, enabled: Boolean(sessionId) },
  );
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

  // Metadata only: this page is already watching the live picture, so asking
  // the agent for thumbnails on top would capture the same desktop twice.
  useEffect(() => {
    if (!sessionId || !stream) return;
    const open = () =>
      void startObservation(sessionId, { intervalMs: 0, thumbWidth: OBSERVE_THUMB_WIDTH }, windowId).catch(
        ignoreWindowError,
      );
    open();
    const timer = window.setInterval(open, OBSERVE_RENEW_MS);
    return () => {
      window.clearInterval(timer);
      void stopRef.current(sessionId, windowId).catch(ignoreWindowError);
    };
  }, [sessionId, stream, windowId, startObservation]);

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

      <div className="relative min-h-0 flex-1">
        {stream ? (
          <>
            <iframe
              src={stream}
              title={t('observe.streamTitle')}
              onLoad={() => setReady(true)}
              // The viewer credential is what makes this read-only; blocking
              // pointer events only keeps a click from looking as if it landed.
              className="pointer-events-none size-full border-0 bg-anthracite-950"
              allow="fullscreen"
            />
            {!ready && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-aurora">
                <Loader2 className="size-6 animate-spin text-gold-400" />
                <p className="text-sm text-muted-foreground">{t('observe.connecting')}</p>
              </div>
            )}
          </>
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-3 px-6 text-center">
            <MonitorX className="size-9 text-muted-foreground" />
            <p className="font-display text-lg">{t('observe.unavailableTitle')}</p>
            <p className="max-w-md text-sm text-muted-foreground">{t('observe.unavailableDescription')}</p>
            <Button variant="secondary" size="sm" onClick={back} className="mt-1">
              {t('observe.backToMonitor')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
