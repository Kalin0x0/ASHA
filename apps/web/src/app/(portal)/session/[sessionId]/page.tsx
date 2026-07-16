'use client';

import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  CameraOff,
  Check,
  Clipboard,
  Download,
  Loader2,
  Maximize2,
  Monitor,
  Pause,
  Play,
  Power,
  Printer,
  RotateCw,
  Settings,
  Share2,
  Upload,
  Volume2,
  VolumeX,
  Wifi,
  Usb,
  X,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { AshaMark } from '@/components/brand/logo';
import { getAccessToken } from '@/lib/api/auth-store';
import { useConfirm } from '@/components/ui/confirm';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  type ApiSessionConnection,
  createShare,
  getSessionConnection,
  pauseSession,
  resizeSession,
  resumeSession,
  terminateSession,
} from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/client';
import { isLive } from '@/lib/api/mode';
import { useLaunchableWorkspaces, useSession } from '@/lib/hooks';
import { useKeepalive } from '@/lib/use-keepalive';
import { isLikelyUnreachableUrl } from '@/lib/stream';
import { cn } from '@/lib/utils';

// How long to wait for a launch to reach RUNNING before showing a clear
// "taking too long" state with a retry — so a stuck launch (no agent, slow
// image pull, weak connection) never spins forever.
const LAUNCH_TIMEOUT_MS = 90_000;

type Dlp = NonNullable<ApiSessionConnection['dlp']>;

// Standard monitor geometries offered by the multi-monitor selector.
// Display labels resolve at render via the `viewer.toolbar.resolutions.*` messages.
const RESOLUTIONS = [
  { key: 'r720', w: 1280, h: 720 },
  { key: 'r1080', w: 1920, h: 1080 },
  { key: 'r1440', w: 2560, h: 1440 },
  { key: 'r2160', w: 3840, h: 2160 },
  { key: 'dual', w: 3840, h: 1080 },
] as const;

// Provisioning checklist — labels resolve at render via `viewer.status.steps.*`.
const STEPS = ['allocating', 'pullingImage', 'startingContainer', 'securingChannel'] as const;

/** Maps the live session status onto the provisioning checklist index. */
function stepForStatus(status: string | undefined): number {
  switch (status) {
    case 'REQUESTED':
      return 0;
    case 'SCHEDULED':
      return 1;
    case 'PROVISIONING':
      return 2;
    case 'RUNNING':
    case 'DEGRADED':
      return 3;
    default:
      return 0;
  }
}

/** Remote-desktop protocols stream through the guacd canvas at /connect. */
const REMOTE_DESKTOP_PROTOCOLS = new Set(['RDP', 'VNC', 'SSH']);

/** Lazy-load the self-hosted jsmpeg decoder (MPEG-TS/MP2 → WebAudio) on first use. */
function ensureJsmpeg(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if ((window as unknown as { JSMpeg?: unknown }).JSMpeg) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.getElementById('jsmpeg-lib') as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('jsmpeg load failed')), { once: true });
      return;
    }
    const s = document.createElement('script');
    s.id = 'jsmpeg-lib';
    s.src = '/vendor/jsmpeg.min.js';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('jsmpeg load failed'));
    document.head.appendChild(s);
  });
}

export default function StreamingViewerPage() {
  const t = useTranslations('viewer');
  const tc = useTranslations('common');
  const confirm = useConfirm();
  const locale = useLocale();
  const params = useParams<{ sessionId: string }>();
  const router = useRouter();
  const session = useSession(params.sessionId);
  const stageRef = useRef<HTMLDivElement>(null);
  // Handle to the embedded KasmVNC iframe so toolbar buttons can drive its
  // same-origin DOM controls (clipboard + settings panels). KasmVNC does NOT
  // expose its UI object on `window`, so we go through the control-bar DOM.
  const kasmFrameRef = useRef<HTMLIFrameElement>(null);
  const [frameReady, setFrameReady] = useState(false);
  // Audio-out: a jsmpeg player decoding the container's MPEG-TS/MP2 speaker stream
  // (served per-session at /session/<kasmId>/audio → container :4901).
  const audioPlayerRef = useRef<{ destroy?: () => void } | null>(null);
  const [audioOn, setAudioOn] = useState(false);
  // Print preview: the KasmVNC-relayed PDF, captured same-origin, shown reliably
  // in an in-app viewer (the guest's own hidden-iframe print() is fragile).
  const printFrameRef = useRef<HTMLIFrameElement>(null);
  const [printPdf, setPrintPdf] = useState<string | null>(null);
  const [printOpen, setPrintOpen] = useState(false);
  const [clock, setClock] = useState('');
  const [webcamOpen, setWebcamOpen] = useState(false);
  const [paused, setPaused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resMenuOpen, setResMenuOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [dlp, setDlp] = useState<Dlp>({});
  const [timedOut, setTimedOut] = useState(false);

  const workspaceName = session?.workspaceName ?? t('status.workspaceFallback');
  // Resolve the workspace's description to show under the title in the control bar.
  const workspaces = useLaunchableWorkspaces();
  const workspaceDescription = workspaces.find((w) => w.friendlyName === session?.workspaceName)?.description;
  // The viewer is a fullscreen takeover — render it through a portal to <body> so
  // it escapes the portal layout's stacking context (otherwise the "My Workspaces"
  // header paints over it). Portal only after mount (document is client-only).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const status = session?.status;
  const isPaused = status === 'PAUSED' || paused;
  const isRunning = status === 'RUNNING' || status === 'DEGRADED';
  const isError = status === 'ERROR' || status === 'DESTROYED' || status === 'TERMINATING';
  // Keep the session alive while it's live so the idle reaper doesn't terminate
  // a desktop the user is actively watching/using.
  useKeepalive(session?.id, isRunning);
  const connectionUrl = session?.connectionUrl;
  // Remote-desktop sessions (RDP/VNC/SSH) render on the guacd canvas at /connect,
  // not in an embedded iframe — the stored connectionUrl points at the proxy's
  // /session/<kasmId> path (same-origin → collides with this route + X-Frame).
  // Redirect to the canvas, which derives its own WS URL from the page origin.
  const isRemoteDesktop = session ? REMOTE_DESKTOP_PROTOCOLS.has(session.connectionType) : false;
  useEffect(() => {
    if (isRemoteDesktop && session) router.replace(`/connect/${session.kasmId}`);
  }, [isRemoteDesktop, session, router]);
  // The stream URL may point at a host the browser can't resolve (e.g. the
  // default asha.local). Detect it so we can show a clear error rather than
  // letting the <iframe> fail with a raw browser DNS error.
  const unreachable =
    isRunning &&
    !!connectionUrl &&
    typeof window !== 'undefined' &&
    isLikelyUnreachableUrl(connectionUrl, window.location.hostname);
  const isWebRtc = session?.connectionType === 'NEKO_WEBRTC';
  const protocolLabel = isWebRtc ? 'WebRTC/H.264' : (session?.connectionType ?? 'KasmVNC');
  // Connected = the session is live AND its embedded client has finished loading
  // (or there is no real stream to wait on, i.e. the placeholder surface).
  const connected = isRunning && (frameReady || !connectionUrl);

  useEffect(() => {
    const tick = () =>
      setClock(new Date().toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }));
    tick();
    const i = setInterval(tick, 1000);
    return () => clearInterval(i);
  }, [locale]);

  // Reset the load gate whenever the embedded URL changes (e.g. reconnect).
  useEffect(() => {
    setFrameReady(false);
  }, [connectionUrl]);

  // Tear down the audio player when leaving the session.
  useEffect(() => {
    return () => {
      try {
        audioPlayerRef.current?.destroy?.();
      } catch {
        /* noop */
      }
      audioPlayerRef.current = null;
    };
  }, []);

  // Capture KasmVNC's printed PDF (same-origin) and surface it in an in-app viewer.
  // The guest client builds an application/pdf Blob and prints it from a hidden
  // display:none iframe via contentWindow.print() — unreliable in Chromium, and
  // invisible to the user. Wrap the iframe's URL.createObjectURL so we grab that
  // Blob and show it from Asha's own top document (reliable Print + Download).
  useEffect(() => {
    if (!frameReady) return;
    withKasm((w) => {
      const win = w as unknown as Window & typeof globalThis;
      const wu = win.URL as typeof win.URL & { __ashaPdfWrap?: boolean };
      if (wu.__ashaPdfWrap) return;
      const orig = wu.createObjectURL.bind(wu);
      wu.createObjectURL = ((obj: Blob | MediaSource) => {
        const url = orig(obj as Blob);
        try {
          if (obj instanceof win.Blob && (obj as Blob).type === 'application/pdf') {
            (obj as Blob).arrayBuffer().then((buf) => {
              const top = URL.createObjectURL(new Blob([buf], { type: 'application/pdf' }));
              setPrintPdf((prev) => {
                if (prev) URL.revokeObjectURL(prev);
                return top;
              });
              setPrintOpen(true);
            });
          }
        } catch {
          /* noop */
        }
        return url;
      }) as typeof wu.createObjectURL;
      wu.__ashaPdfWrap = true;
    });
  }, [frameReady]);

  // Revoke the captured PDF blob URL on unmount.
  useEffect(
    () => () => {
      if (printPdf) URL.revokeObjectURL(printPdf);
    },
    [printPdf],
  );

  // Launch watchdog: if the session hasn't reached RUNNING (or ERROR) within the
  // timeout, surface a clear "taking too long" state with a retry instead of an
  // endless spinner. Cleared the moment the session is live or has failed.
  useEffect(() => {
    if (isRunning || isError) {
      setTimedOut(false);
      return;
    }
    const id = setTimeout(() => setTimedOut(true), LAUNCH_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [isRunning, isError, session?.id]);

  // Pull the DLP policy so the toolbar can grey out disallowed controls.
  useEffect(() => {
    if (!isLive || !session?.id || !isRunning) return;
    let cancelled = false;
    getSessionConnection(session.id)
      .then((c) => {
        if (!cancelled && c.dlp) setDlp(c.dlp);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [session?.id, isRunning]);

  // A capability is allowed unless the policy explicitly forbids it (=== false).
  const allow = (key: keyof Dlp) => dlp[key] !== false;

  // Run `cb` against the embedded KasmVNC window/document when the same-origin
  // frame is loaded. Returns false (so callers can fall back to a toast) if the
  // frame is missing, not yet loaded, cross-origin, or `cb` throws.
  const withKasm = (
    cb: (win: Window & { updateSetting?: (n: string, v: unknown) => void }, doc: Document) => void,
  ): boolean => {
    const frame = kasmFrameRef.current;
    if (!frame || !frameReady) return false;
    try {
      const win = frame.contentWindow as (Window & { updateSetting?: (n: string, v: unknown) => void }) | null;
      const doc = frame.contentDocument;
      if (!win || !doc) return false;
      cb(win, doc);
      return true;
    } catch {
      return false; // cross-origin / SecurityError
    }
  };

  // Settings → reveal KasmVNC's own settings panel via its control bar. The
  // input carries class `noVNC_button`, so a synthetic click bubbles to the
  // wrapper where KasmVNC bound the toggle handler (verified against the bundle).
  const openKasmSettings = () => {
    const ok = withKasm((_w, d) => {
      const btn = d.getElementById('noVNC_settings_button') as HTMLElement | null;
      if (!btn) throw new Error('no settings control');
      btn.click();
    });
    if (!ok) toast(t('toolbar.settingsToast'));
  };

  // Clipboard → bridge the host clipboard into the session (local→remote) and,
  // when only the down-direction is allowed, mirror the guest clipboard back.
  // Drives KasmVNC's native #noVNC_clipboard_text control; respects DLP and
  // degrades to an informational toast if the control is absent or access fails.
  const syncClipboard = async () => {
    if (!allow('clipboardUp') && !allow('clipboardDown')) {
      toast(t('dlp.clipboardDisabledHint'));
      return;
    }
    let host = '';
    if (allow('clipboardUp')) {
      try {
        host = await navigator.clipboard.readText();
      } catch {
        toast(t('toolbar.clipboardToast'));
        return;
      }
    }
    const ran = withKasm((w, d) => {
      const ta = d.getElementById('noVNC_clipboard_text') as HTMLTextAreaElement | null;
      if (!ta) throw new Error('no clipboard control'); // forces the fallback toast
      // Enable only the DLP-allowed directions (idempotent).
      if (allow('clipboardUp')) {
        const cb = d.getElementById('noVNC_setting_clipboard_up') as HTMLInputElement | null;
        if (cb && !cb.checked) {
          cb.checked = true;
          cb.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
      if (allow('clipboardDown')) {
        const cb = d.getElementById('noVNC_setting_clipboard_down') as HTMLInputElement | null;
        if (cb && !cb.checked) {
          cb.checked = true;
          cb.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
      if (typeof w.updateSetting === 'function') {
        try {
          if (allow('clipboardUp')) w.updateSetting('clipboard_up', true);
          if (allow('clipboardDown')) w.updateSetting('clipboard_down', true);
        } catch {
          /* updateSetting persists only — ignore */
        }
      }
      if (allow('clipboardUp') && host) {
        ta.value = host;
        ta.dispatchEvent(new Event('change', { bubbles: true })); // → rfb.clipboardPasteFrom
      } else if (allow('clipboardDown') && ta.value) {
        void navigator.clipboard.writeText(ta.value).catch(() => {});
      }
    });
    if (!ran) {
      toast(t('toolbar.clipboardToast'));
      return;
    }
    toast.success(allow('clipboardUp') && host ? t('toolbar.clipboardSent') : t('toolbar.clipboardSynced'));
  };

  const togglePause = async () => {
    if (!session) return;
    setBusy(true);
    try {
      if (isPaused) {
        if (isLive) await resumeSession(session.id);
        setPaused(false);
        toast.success(t('status.resumedToast'));
      } else {
        if (isLive) await pauseSession(session.id);
        setPaused(true);
        toast.success(t('status.paused'), { description: t('status.pausedToastDescription') });
      }
    } catch {
      toast.error(isPaused ? t('status.resumeError') : t('status.pauseError'));
    } finally {
      setBusy(false);
    }
  };

  const applyResolution = async (w: number, h: number, label: string) => {
    setResMenuOpen(false);
    if (!session) return;
    try {
      if (isLive) await resizeSession(session.id, w, h);
      toast.success(t('toolbar.displaySet', { label }));
    } catch {
      toast.error(t('toolbar.resolutionError'));
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (!allow('uploads')) {
      toast.error(t('dlp.uploadsDisabledToast'), { description: t('dlp.uploadsDisabledToastDescription') });
      return;
    }
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;
    toast.success(t('toolbar.filesQueued', { count: files.length }), {
      description: t('toolbar.filesQueuedDescription'),
    });
  };

  const disconnect = () => router.push('/');
  const onTerminate = async () => {
    if (
      !(await confirm({
        title: t('confirmEnd.title'),
        description: t('confirmEnd.description', { name: workspaceName }),
        confirmLabel: t('confirmEnd.confirm'),
      }))
    )
      return;
    // Terminate by the id from the URL — NOT the fetched `session`, which is null
    // for a normal user who can't read the admin session-detail endpoint (so the
    // old `if (session)` guard skipped the call and the desktop kept running).
    // Await the DELETE so it isn't dropped by the immediate navigation, and
    // surface a failure instead of the misleading success toast.
    if (isLive) {
      try {
        await terminateSession(params.sessionId);
      } catch (e) {
        toast.error(t('confirmEnd.error'), {
          description: e instanceof ApiError ? e.message : t('confirmEnd.errorDescription'),
        });
        return;
      }
    }
    toast.success(t('status.endedToast'));
    router.push('/');
  };
  // Speaker (audio-out): toggle a jsmpeg player on the per-session audio route.
  // Created inside the click so the AudioContext starts under a user gesture (no
  // autoplay block). Degrades to a toast if the lib or stream can't load.
  const toggleAudio = async () => {
    if (audioOn) {
      try {
        audioPlayerRef.current?.destroy?.();
      } catch {
        /* noop */
      }
      audioPlayerRef.current = null;
      setAudioOn(false);
      return;
    }
    if (!allow('audioOut')) {
      toast(t('dlp.audioDisabledHint'));
      return;
    }
    const kasmId = session?.kasmId;
    if (!kasmId) return;
    try {
      await ensureJsmpeg();
      const J = (
        window as unknown as {
          JSMpeg?: { Player: new (url: string, opts: Record<string, unknown>) => { destroy?: () => void } };
        }
      ).JSMpeg;
      if (!J) throw new Error('jsmpeg unavailable');
      const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const token = getAccessToken() ?? '';
      const url = `${scheme}://${window.location.host}/session/${encodeURIComponent(kasmId)}/audio?token=${encodeURIComponent(token)}`;
      let established = false;
      const player = new J.Player(url, {
        audio: true,
        video: false,
        autoplay: true,
        // Fires when the audio WebSocket actually connects — lets us tell a broken
        // route ("never established") apart from a working stream with no sound.
        onSourceEstablished: () => {
          established = true;
        },
      }) as {
        destroy?: () => void;
        audioOut?: { context?: { resume?: () => void; state?: string } };
      };
      audioPlayerRef.current = player;
      // jsmpeg can create the AudioContext in a suspended state even inside a user
      // gesture → everything runs but stays silent. Resume it explicitly now.
      try {
        void player.audioOut?.context?.resume?.();
      } catch {
        /* noop */
      }
      setAudioOn(true);
      toast.success(t('toolbar.audioOn'));
      // Diagnose reachability: if the stream never connects, the route/auth (not the
      // decoder) is the problem — surface it instead of failing silently.
      window.setTimeout(() => {
        if (audioPlayerRef.current === player && !established) {
          toast.error(t('toolbar.audioUnreachable'));
        }
      }, 4000);
    } catch {
      toast.error(t('toolbar.audioError'));
    }
  };

  const fullscreen = () => {
    stageRef.current?.requestFullscreen?.().catch(() => {});
  };
  const onShare = async () => {
    if (!session) return;
    if (!isLive) {
      toast(t('toolbar.shareNeedsLive'), {
        description: t('toolbar.shareNeedsLiveDescription'),
      });
      return;
    }
    try {
      const share = await createShare(session.id, { enableChat: true });
      const link = `${window.location.origin}/share/${share.shareKey}`;
      await navigator.clipboard.writeText(link).catch(() => {});
      toast.success(t('toolbar.shareLinkCopied'), { description: link });
    } catch {
      toast.error(t('toolbar.shareLinkError'));
    }
  };

  if (!mounted) return null;
  return createPortal(
    <div className="on-dark fixed inset-0 z-[100] flex flex-col bg-anthracite-950">
      {/* Control bar */}
      <div className="glass-strong absolute inset-x-0 top-0 z-20 flex h-14 items-center gap-3 px-3 sm:px-4">
        {/* Back to Workspaces — non-destructive; keeps the session running so the
            user can switch to another from the portal's "My Sessions" strip. */}
        {/* Always-visible, clearly-labelled exit — users reported getting "stuck"
            inside the stream with only an unlabelled arrow to leave by. */}
        <button
          onClick={disconnect}
          aria-label={t('toolbar.backToWorkspaces')}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-white/10 ps-2 pe-2.5 text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground ring-gold-focus"
        >
          <ArrowLeft className="size-[18px] rtl:rotate-180" />
          <span className="hidden text-sm font-medium sm:inline">{t('toolbar.backToWorkspaces')}</span>
        </button>

        {/* flex-1 + min-w-0 = basis 0: the title/description yield space to the
            toolbar and truncate, instead of a long workspace description sizing
            this block off its content and squeezing the controls. */}
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <AshaMark className="size-7 shrink-0" />
          <div className="min-w-0 leading-tight">
            <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <span className="truncate">{workspaceName}</span>
              <span
                className={cn(
                  'inline-flex shrink-0 items-center gap-1 text-[11px] font-medium',
                  isError ? 'text-destructive' : connected ? 'text-success' : 'text-warning',
                )}
              >
                <span
                  className={cn(
                    'size-1.5 rounded-full',
                    isError ? 'bg-destructive' : connected ? 'bg-success animate-pulse-ring' : 'bg-warning',
                  )}
                />
                {isError ? t('status.disconnected') : connected ? t('status.connected') : t('status.connecting')}
              </span>
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              {workspaceDescription || `${session?.connectionType ?? ''} · ${session?.zone ?? ''}`}
            </p>
          </div>
        </div>

        {connected && (
          <div className="ml-2 hidden shrink-0 items-center gap-1.5 rounded-md bg-anthracite-900/60 px-2.5 py-1 font-mono text-[11px] text-muted-foreground sm:flex">
            <Wifi className="size-3 text-success" />
            {t('status.live')} ·{' '}
            <span className={cn(isWebRtc && 'text-gold-400')}>{protocolLabel}</span>
          </div>
        )}

        <div className="ms-auto flex items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <ControlButton
            label={t('toolbar.clipboard')}
            disabled={!allow('clipboardUp') && !allow('clipboardDown')}
            disabledHint={t('dlp.clipboardDisabledHint')}
            onClick={() => void syncClipboard()}
          >
            <Clipboard className="size-4" />
          </ControlButton>
          <ControlButton
            label={t('toolbar.uploadFile')}
            disabled={!allow('uploads')}
            disabledHint={t('dlp.uploadsDisabledHint')}
            onClick={() => toast(t('toolbar.uploadToast'))}
          >
            <Upload className="size-4" />
          </ControlButton>
          <ControlButton
            label={audioOn ? t('toolbar.audioOff') : t('toolbar.audio')}
            disabled={!allow('audioOut')}
            disabledHint={t('dlp.audioDisabledHint')}
            onClick={() => void toggleAudio()}
          >
            {audioOn ? (
              <Volume2 className="size-4 text-gold-400" />
            ) : allow('audioOut') ? (
              <Volume2 className="size-4" />
            ) : (
              <VolumeX className="size-4" />
            )}
          </ControlButton>
          <ControlButton
            label={t('toolbar.virtualPrinter')}
            disabled={!allow('printing')}
            disabledHint={t('dlp.printingDisabledHint')}
            onClick={() => {
              if (printPdf) setPrintOpen(true);
              else toast(t('toolbar.printToast'), { description: t('toolbar.printToastDescription') });
            }}
          >
            <Printer className={cn('size-4', printPdf && 'text-gold-400')} />
          </ControlButton>
          <ControlButton
            label={webcamOpen ? t('toolbar.closeCamera') : t('toolbar.camera')}
            disabled={!allow('audioIn') && isLive && dlp.audioIn === false}
            onClick={() => setWebcamOpen((v) => !v)}
          >
            {webcamOpen ? <CameraOff className="size-4 text-gold-400" /> : <Camera className="size-4" />}
          </ControlButton>
          <ControlButton
            label={t('toolbar.usbDevices')}
            onClick={() =>
              toast(t('toolbar.deviceToast'), {
                description: t('toolbar.deviceToastDescription'),
              })
            }
          >
            <Usb className="size-4" />
          </ControlButton>

          {/* Multi-monitor / resolution selector */}
          <div className="relative shrink-0">
            <ControlButton label={t('toolbar.displayMonitors')} onClick={() => setResMenuOpen((v) => !v)}>
              <Monitor className={cn('size-4', resMenuOpen && 'text-gold-400')} />
            </ControlButton>
            {resMenuOpen && (
              <div className="absolute right-0 top-9 z-40 w-48 overflow-hidden rounded-lg border border-white/10 bg-anthracite-900/95 py-1 shadow-[var(--shadow-lifted)] backdrop-blur">
                <p className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {t('toolbar.resolution')}
                </p>
                {RESOLUTIONS.map((r) => (
                  <button
                    key={r.key}
                    onClick={() => applyResolution(r.w, r.h, t(`toolbar.resolutions.${r.key}`))}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-start text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  >
                    <Monitor className="size-3.5" /> {t(`toolbar.resolutions.${r.key}`)}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Pause / Resume */}
          <ControlButton
            label={isPaused ? t('toolbar.resumeSession') : t('toolbar.pauseSession')}
            onClick={() => void togglePause()}
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : isPaused ? (
              <Play className="size-4 text-gold-400" />
            ) : (
              <Pause className="size-4" />
            )}
          </ControlButton>

          <ControlButton label={t('toolbar.shareSession')} onClick={onShare}>
            <Share2 className="size-4" />
          </ControlButton>
          <ControlButton label={t('toolbar.settings')} onClick={openKasmSettings}>
            <Settings className="size-4" />
          </ControlButton>
          <ControlButton label={t('toolbar.fullscreen')} onClick={fullscreen}>
            <Maximize2 className="size-4" />
          </ControlButton>
          <button
            onClick={() => void onTerminate()}
            className="ml-1 inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-destructive/90 px-3 text-xs font-medium text-destructive-foreground transition-colors hover:bg-destructive ring-gold-focus"
          >
            <Power className="size-3.5" /> <span className="hidden sm:inline">{t('toolbar.end')}</span>
          </button>
        </div>
      </div>

      {/* Stage */}
      <div
        ref={stageRef}
        className="relative flex-1 overflow-hidden bg-anthracite-950 touch-manipulation"
        onDragOver={(e) => {
          if (isRunning) {
            e.preventDefault();
            setDragActive(true);
          }
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDrop}
      >
        {isError ? (
          <Disconnected workspaceName={workspaceName} onRetry={() => router.refresh()} onBack={disconnect} />
        ) : isRunning ? (
          unreachable ? (
            <UnreachableHost url={connectionUrl!} onBack={disconnect} />
          ) : connectionUrl && !isRemoteDesktop ? (
            <LiveStream
              url={connectionUrl}
              workspaceName={workspaceName}
              isWebRtc={isWebRtc}
              ready={frameReady}
              onReady={() => setFrameReady(true)}
              frameRef={kasmFrameRef}
            />
          ) : (
            <PlaceholderStream workspaceName={workspaceName} clock={clock} />
          )
        ) : timedOut ? (
          <LaunchTimedOut
            workspaceName={workspaceName}
            onRetry={() => {
              setTimedOut(false);
              router.refresh();
            }}
            onBack={disconnect}
          />
        ) : (
          <Provisioning status={status} workspaceName={workspaceName} />
        )}

        {/* Floating webcam capture panel — getUserMedia, stays in-frame as PiP */}
        {webcamOpen && isRunning && (
          <WebcamPanel isWebRtc={isWebRtc} onClose={() => setWebcamOpen(false)} />
        )}

        {/* Print preview — the PDF KasmVNC produced, shown reliably from Asha's
            own document (Print + Download), instead of the guest's fragile
            hidden-iframe print. */}
        {printOpen && printPdf && (
          <div className="absolute inset-0 top-12 z-50 flex flex-col bg-anthracite-950/92 backdrop-blur">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Printer className="size-4 text-gold-400" /> {t('toolbar.printPreview')}
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={printPdf}
                  download="Kasm-Print.pdf"
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border-subtle px-3 text-xs font-medium transition-colors hover:bg-secondary ring-gold-focus"
                >
                  <Download className="size-3.5" /> {t('toolbar.download')}
                </a>
                <button
                  onClick={() => {
                    try {
                      printFrameRef.current?.contentWindow?.focus();
                      printFrameRef.current?.contentWindow?.print();
                    } catch {
                      /* noop */
                    }
                  }}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md bg-gold-500/90 px-3 text-xs font-medium text-anthracite-950 transition-colors hover:bg-gold-500 ring-gold-focus"
                >
                  <Printer className="size-3.5" /> {t('toolbar.print')}
                </button>
                <button
                  onClick={() => setPrintOpen(false)}
                  aria-label={tc('actions.close')}
                  className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground ring-gold-focus"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>
            <iframe
              ref={printFrameRef}
              src={printPdf}
              title={t('toolbar.printPreview')}
              className="min-h-0 flex-1 border-0 bg-white"
            />
          </div>
        )}

        {/* Drag-and-drop file upload overlay */}
        {dragActive && (
          <div className="absolute inset-0 top-12 z-40 flex flex-col items-center justify-center gap-3 border-2 border-dashed border-gold-500/60 bg-anthracite-950/80 backdrop-blur-sm">
            <Upload className="size-10 text-gold-400" />
            <p className="font-display text-lg">
              {allow('uploads') ? t('toolbar.dropToUpload') : t('dlp.dropDisabled')}
            </p>
          </div>
        )}

        {/* Paused overlay */}
        {isPaused && isRunning && (
          <div className="absolute inset-0 top-12 z-30 flex flex-col items-center justify-center gap-4 bg-anthracite-950/85 backdrop-blur">
            <Pause className="size-12 rounded-full bg-gold-500/15 p-3 text-gold-400" />
            <div className="text-center">
              <h2 className="font-display text-2xl font-medium">{t('status.paused')}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t('status.pausedDescription')}</p>
            </div>
            <button
              onClick={() => void togglePause()}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-gold-500/90 px-4 text-sm font-medium text-anthracite-950 transition-colors hover:bg-gold-500 ring-gold-focus"
            >
              <Play className="size-4" /> {t('status.resume')}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function ControlButton({
  children,
  label,
  onClick,
  disabled = false,
  disabledHint,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  disabledHint?: string;
}) {
  const t = useTranslations('viewer');

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={disabled ? () => disabledHint && toast(disabledHint) : onClick}
          aria-label={label}
          aria-disabled={disabled}
          className={cn(
            'inline-flex size-8 shrink-0 items-center justify-center rounded-md transition-colors ring-gold-focus',
            disabled
              ? 'cursor-not-allowed text-muted-foreground/30'
              : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{disabled ? t('toolbar.disabledByPolicy', { label }) : label}</TooltipContent>
    </Tooltip>
  );
}

/** Embeds either the KasmVNC or Neko (WebRTC/H.264) client inside the session frame. */
function LiveStream({
  url,
  workspaceName,
  isWebRtc,
  ready,
  onReady,
  frameRef,
}: {
  url: string;
  workspaceName: string;
  isWebRtc: boolean;
  ready: boolean;
  onReady: () => void;
  /** Shared with the parent so toolbar buttons can drive the KasmVNC DOM. */
  frameRef: React.RefObject<HTMLIFrameElement | null>;
}) {
  const t = useTranslations('viewer');
  const iframeRef = frameRef;
  const loadingText = isWebRtc
    ? t('status.negotiatingWebRtc')
    : t('status.establishingChannel');

  const handleLoad = () => {
    onReady();
    // Best-effort: KasmVNC's own client bundle can throw a benign uncaught error
    // ("lastActiveAt") and pop its own error dialog. We can't patch the
    // third-party bundle, but on a same-origin session we can swallow that error
    // and hide the dialog *inside the KasmVNC iframe* — this never touches
    // Asha's own UI, and is a no-op if the frame blocks access.
    try {
      const win = iframeRef.current?.contentWindow as (Window & typeof globalThis) | null | undefined;
      const doc = iframeRef.current?.contentDocument;
      if (!win || !doc) return;
      win.addEventListener(
        'error',
        (e: ErrorEvent) => {
          if (typeof e.message === 'string' && e.message.includes('lastActiveAt')) {
            e.preventDefault();
            e.stopImmediatePropagation();
          }
        },
        true,
      );
      const PHRASE = /KasmVNC (hat einen Fehler|has encountered|encountered an error)/i;
      const hideKasmError = () => {
        for (const el of Array.from(doc.querySelectorAll<HTMLElement>('body *'))) {
          // Target the small error dialog only — never a large container/body.
          if (PHRASE.test(el.textContent ?? '') && el.querySelectorAll('*').length < 40) {
            el.style.display = 'none';
          }
        }
      };
      hideKasmError();
      new win.MutationObserver(hideKasmError).observe(doc.body, { childList: true, subtree: true });
    } catch {
      /* cross-origin or access blocked — leave KasmVNC's overlay as-is */
    }
  };

  return (
    <div className="absolute inset-0 pt-14">
      <iframe
        ref={iframeRef}
        src={url}
        title={`${workspaceName} — ${isWebRtc ? 'WebRTC/H.264' : t('status.liveStream')}`}
        onLoad={handleLoad}
        className="size-full border-0 bg-anthracite-950"
        // Neko/KasmVNC both need scripts + clipboard/pointer/fullscreen + WebRTC media.
        allow="fullscreen; clipboard-read; clipboard-write; autoplay; microphone; camera; display-capture"
        allowFullScreen
      />
      {!ready && (
        <div className="absolute inset-0 top-14 flex flex-col items-center justify-center gap-3 bg-aurora">
          <Loader2 className="size-6 animate-spin text-gold-400" />
          <p className="text-sm text-muted-foreground">{loadingText}</p>
        </div>
      )}
    </div>
  );
}

/**
 * Floating picture-in-picture webcam capture panel.
 *
 * For NEKO_WEBRTC sessions: webcam/mic are handled natively inside the Neko
 * iframe (the `allow="camera; microphone"` attribute forwards them). This panel
 * shows a local preview so the user can verify the device is active.
 *
 * For KasmVNC sessions: the device needs `/dev/video0` passed through via
 * workspace dockerConfig.devices; the application in the container then accesses
 * it directly. This panel gives a local preview and tells the user what to do.
 */
function WebcamPanel({ isWebRtc, onClose }: { isWebRtc: boolean; onClose: () => void }) {
  const t = useTranslations('viewer');
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startCamera = useCallback(async () => {
    try {
      const ms = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      setStream(ms);
      if (videoRef.current) videoRef.current.srcObject = ms;
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void startCamera();
    return () => {
      stream?.getTracks().forEach((t) => t.stop());
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="absolute bottom-4 right-4 z-30 flex w-72 flex-col overflow-hidden rounded-xl border border-white/10 bg-anthracite-900/90 shadow-[var(--shadow-lifted)] backdrop-blur">
      <div className="flex items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Camera className="size-3.5 text-gold-400" />
          {isWebRtc ? t('toolbar.cameraPreviewWebRtc') : t('toolbar.cameraPreview')}
        </span>
        <button onClick={onClose} className="hover:text-foreground">✕</button>
      </div>

      {error ? (
        <div className="px-3 pb-3 text-[11px] text-destructive">{error}</div>
      ) : (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="aspect-video w-full bg-anthracite-950 object-cover"
        />
      )}

      <p className="px-3 pb-2.5 pt-1.5 text-[10px] leading-relaxed text-muted-foreground">
        {isWebRtc ? t('toolbar.webcamWebRtcNote') : t('toolbar.webcamKasmNote')}
      </p>
    </div>
  );
}

function Provisioning({ status, workspaceName }: { status: string | undefined; workspaceName: string }) {
  const t = useTranslations('viewer');
  const step = stepForStatus(status);
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-8 bg-aurora">
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <AshaMark className="size-14 animate-pulse" />
          <span className="absolute -inset-4 rounded-full ring-1 ring-gold-500/20 animate-pulse-ring" />
        </div>
        <div className="text-center">
          <h2 className="font-display text-2xl font-medium">{t('status.preparing')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{workspaceName}</p>
        </div>
      </div>

      <ol className="flex w-full max-w-sm flex-col gap-2.5">
        {STEPS.map((key, i) => {
          const done = i < step;
          const active = i === step;
          return (
            <li
              key={key}
              className={cn(
                'flex items-center gap-3 rounded-lg border px-4 py-2.5 text-sm transition-all',
                done && 'border-success/30 bg-success/5 text-foreground',
                active && 'border-[rgba(212,175,55,0.4)] bg-gold-500/5 text-foreground',
                !done && !active && 'border-border-subtle text-muted-foreground',
              )}
            >
              <span className="flex size-5 items-center justify-center">
                {done ? (
                  <Check className="size-4 text-success" />
                ) : active ? (
                  <Loader2 className="size-4 animate-spin text-gold-400" />
                ) : (
                  <span className="size-1.5 rounded-full bg-anthracite-500" />
                )}
              </span>
              {t(`status.steps.${key}`)}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Disconnected({
  workspaceName,
  onRetry,
  onBack,
}: {
  workspaceName: string;
  onRetry: () => void;
  onBack: () => void;
}) {
  const t = useTranslations('viewer');
  const tc = useTranslations('common');

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 bg-aurora">
      <AlertTriangle className="size-12 rounded-full bg-destructive/15 p-2.5 text-destructive" />
      <div className="text-center">
        <h2 className="font-display text-2xl font-medium">{t('status.disconnectedTitle')}</h2>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          {t('status.disconnectedDescription', { name: workspaceName })}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={onRetry}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-border-subtle px-4 text-sm transition-colors hover:bg-secondary ring-gold-focus"
        >
          <RotateCw className="size-4" /> {tc('actions.retry')}
        </button>
        <button
          onClick={onBack}
          className="inline-flex h-9 items-center gap-2 rounded-md bg-gold-500/90 px-4 text-sm font-medium text-anthracite-950 transition-colors hover:bg-gold-500 ring-gold-focus"
        >
          {t('status.backToWorkspaces')}
        </button>
      </div>
    </div>
  );
}

/**
 * The session is RUNNING but its stream URL points at a host the browser can't
 * resolve (typically the default asha.local). Shown instead of letting the
 * <iframe> fail with a raw "server IP address could not be found" DNS error.
 */
function UnreachableHost({ url, onBack }: { url: string; onBack: () => void }) {
  const t = useTranslations('viewer');
  let host = url;
  try {
    host = new URL(url).hostname;
  } catch {
    /* keep raw url */
  }
  const safeUrl = url.split('?')[0]; // drop the session token from display

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 bg-aurora">
      <AlertTriangle className="size-12 rounded-full bg-warning/15 p-2.5 text-warning" />
      <div className="max-w-md text-center">
        <h2 className="font-display text-2xl font-medium">{t('status.unreachableTitle')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('status.unreachableDescription', { host })}
        </p>
        <pre dir="ltr" className="mt-3 overflow-x-auto rounded-md border border-border-subtle bg-anthracite-950/80 px-3 py-2 text-start text-[11px] text-muted-foreground">
          {safeUrl}
        </pre>
      </div>
      <button
        onClick={onBack}
        className="inline-flex h-9 items-center gap-2 rounded-md bg-gold-500/90 px-4 text-sm font-medium text-anthracite-950 transition-colors hover:bg-gold-500 ring-gold-focus"
      >
        {t('status.backToWorkspaces')}
      </button>
    </div>
  );
}

/**
 * The launch has not reached RUNNING within LAUNCH_TIMEOUT_MS — e.g. no agent
 * was available, a slow image pull, or a weak connection. Offers a retry and an
 * exit instead of spinning forever.
 */
function LaunchTimedOut({
  workspaceName,
  onRetry,
  onBack,
}: {
  workspaceName: string;
  onRetry: () => void;
  onBack: () => void;
}) {
  const t = useTranslations('viewer');
  const tc = useTranslations('common');
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 bg-aurora">
      <AlertTriangle className="size-12 rounded-full bg-warning/15 p-2.5 text-warning" />
      <div className="max-w-sm text-center">
        <h2 className="font-display text-2xl font-medium">{t('status.launchTimeoutTitle')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('status.launchTimeoutDescription', { name: workspaceName })}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={onRetry}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-border-subtle px-4 text-sm transition-colors hover:bg-secondary ring-gold-focus"
        >
          <RotateCw className="size-4" /> {tc('actions.retry')}
        </button>
        <button
          onClick={onBack}
          className="inline-flex h-9 items-center gap-2 rounded-md bg-gold-500/90 px-4 text-sm font-medium text-anthracite-950 transition-colors hover:bg-gold-500 ring-gold-focus"
        >
          {t('status.backToWorkspaces')}
        </button>
      </div>
    </div>
  );
}

/**
 * Shown when a session is live but no real stream endpoint is configured
 * (mock mode without NEXT_PUBLIC_DEMO_STREAM_URL). Tells the operator exactly
 * how to wire a real container while keeping the launch → viewer flow working.
 */
function PlaceholderStream({ workspaceName, clock }: { workspaceName: string; clock: string }) {
  const t = useTranslations('viewer');

  return (
    <div className="absolute inset-0 pt-12">
      <div className="relative size-full overflow-hidden bg-aurora">
        <div className="absolute inset-0 bg-grid opacity-20" />
        <AshaMark className="absolute left-1/2 top-1/2 size-[560px] -translate-x-1/2 -translate-y-1/2 opacity-[0.03]" />

        {/* Central setup panel — high-contrast so it's unmistakable */}
        <div className="absolute left-1/2 top-1/2 w-[min(560px,90vw)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-gold-500/30 bg-anthracite-900 shadow-[0_0_0_1px_rgba(212,175,55,0.08),0_24px_64px_rgba(0,0,0,0.6)]">
          {/* Header */}
          <div className="flex items-center gap-3 border-b border-border-subtle bg-anthracite-800 px-5 py-3.5">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-success/15">
              <Check className="size-3.5 text-success" />
            </div>
            <span className="text-sm font-medium">{workspaceName}</span>
            <span className="ms-auto inline-flex shrink-0 items-center gap-1 rounded-full border border-gold-500/30 bg-gold-500/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-gold-300">
              {t('status.demoModeBadge')}
            </span>
          </div>

          {/* Body */}
          <div className="flex flex-col gap-4 p-6">
            <div className="text-center">
              <p className="font-display text-lg font-medium">{t('status.noStreamTitle')}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {t('status.noStreamDescription', { name: workspaceName })}
              </p>
            </div>

            <pre dir="ltr" className="overflow-x-auto rounded-lg border border-border-subtle bg-anthracite-950 px-4 py-3.5 text-start text-[11px] leading-relaxed text-muted-foreground">
              {`# 1. Run a KasmVNC container locally:
docker run --rm -p 6901:6901 \\
  -e VNC_PW=password kasmweb/firefox:1.16.0-rolling

# 2. Add to .env (or docker-compose.yml build args):
NEXT_PUBLIC_DEMO_STREAM_URL=https://localhost:6901`}
            </pre>

            <p className="text-center text-[11px] text-muted-foreground/70">
              {t('status.noStreamSetupHint')}
            </p>
          </div>
        </div>

        {/* Mock taskbar */}
        <div className="absolute inset-x-0 bottom-0 flex h-10 items-center gap-3 border-t border-white/5 bg-anthracite-800/80 px-4 backdrop-blur-sm">
          <button className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-muted-foreground/70 hover:bg-white/5 hover:text-muted-foreground transition-colors">
            <AshaMark className="size-3.5" /> {t('status.start')}
          </button>
          <div className="ms-auto flex items-center gap-3 text-xs text-muted-foreground">
            <Wifi className="size-3 text-success" />
            <span className="tnum">{clock}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
