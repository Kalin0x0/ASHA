'use client';

import {
  AlertTriangle,
  Camera,
  CameraOff,
  Check,
  Clipboard,
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
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { ChistaMark } from '@/components/brand/logo';
import { SessionWatermark } from '@/components/composite/session-watermark';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuth } from '@/lib/api/auth-context';
import { CURRENT_USER } from '@/lib/current-user';
import {
  type ApiSessionConnection,
  createShare,
  getSessionConnection,
  pauseSession,
  resizeSession,
  resumeSession,
} from '@/lib/api/endpoints';
import { isLive } from '@/lib/api/mode';
import { useSession, useTerminateSession } from '@/lib/hooks';
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
    default:
      return 0;
  }
}

/** Remote-desktop protocols stream through the guacd canvas at /connect. */
const REMOTE_DESKTOP_PROTOCOLS = new Set(['RDP', 'VNC', 'SSH']);

export default function StreamingViewerPage() {
  const t = useTranslations('viewer');
  const locale = useLocale();
  const params = useParams<{ sessionId: string }>();
  const router = useRouter();
  const session = useSession(params.sessionId);
  const terminate = useTerminateSession();
  const { user } = useAuth();
  // Who is watching — stamped across the stream as an attribution deterrent.
  // Falls back to the fixed mock identity when there's no live auth session.
  const viewerIdentity = `${user?.displayName || user?.username || CURRENT_USER.name} · ${
    user?.email || CURRENT_USER.email
  }`;

  const stageRef = useRef<HTMLDivElement>(null);
  const [frameReady, setFrameReady] = useState(false);
  const [clock, setClock] = useState('');
  const [webcamOpen, setWebcamOpen] = useState(false);
  const [paused, setPaused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resMenuOpen, setResMenuOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [dlp, setDlp] = useState<Dlp>({});
  const [timedOut, setTimedOut] = useState(false);

  const workspaceName = session?.workspaceName ?? t('status.workspaceFallback');
  const status = session?.status;
  const isPaused = status === 'PAUSED' || paused;
  const isRunning = status === 'RUNNING' || status === 'DEGRADED';
  const isError = status === 'ERROR' || status === 'DESTROYED' || status === 'TERMINATING';
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
  // default chista.local). Detect it so we can show a clear error rather than
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
  const onTerminate = () => {
    if (session) terminate(session.id);
    toast.success(t('status.endedToast'));
    router.push('/');
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

  return (
    <div className="on-dark fixed inset-0 z-50 flex flex-col bg-anthracite-950">
      {/* Control bar */}
      <div className="glass-strong absolute inset-x-0 top-0 z-20 flex h-12 items-center gap-3 px-4">
        <div className="flex items-center gap-2">
          <ChistaMark className="size-5" />
          <span className="text-sm font-medium">{workspaceName}</span>
          <span
            className={cn(
              'ml-1 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs',
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
        </div>

        {connected && (
          <div className="ml-2 hidden items-center gap-1.5 rounded-md bg-anthracite-900/60 px-2.5 py-1 font-mono text-[11px] text-muted-foreground sm:flex">
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
            onClick={() => toast(t('toolbar.clipboardToast'))}
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
            label={t('toolbar.audio')}
            disabled={!allow('audioOut')}
            disabledHint={t('dlp.audioDisabledHint')}
            onClick={() => toast(t('toolbar.audioToast'))}
          >
            {allow('audioOut') ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
          </ControlButton>
          <ControlButton
            label={t('toolbar.virtualPrinter')}
            disabled={!allow('printing')}
            disabledHint={t('dlp.printingDisabledHint')}
            onClick={() =>
              toast(t('toolbar.printToast'), {
                description: t('toolbar.printToastDescription'),
              })
            }
          >
            <Printer className="size-4" />
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
          <ControlButton label={t('toolbar.settings')} onClick={() => toast(t('toolbar.settingsToast'))}>
            <Settings className="size-4" />
          </ControlButton>
          <ControlButton label={t('toolbar.fullscreen')} onClick={fullscreen}>
            <Maximize2 className="size-4" />
          </ControlButton>
          <button
            onClick={onTerminate}
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

        {/* Identity watermark — always on while the stream is live (screenshot /
            photo-of-screen deterrent). pointer-events-none so input passes through. */}
        {isRunning && <SessionWatermark identity={viewerIdentity} sessionId={session?.id} />}

        {/* Floating webcam capture panel — getUserMedia, stays in-frame as PiP */}
        {webcamOpen && isRunning && (
          <WebcamPanel isWebRtc={isWebRtc} onClose={() => setWebcamOpen(false)} />
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
    </div>
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
}: {
  url: string;
  workspaceName: string;
  isWebRtc: boolean;
  ready: boolean;
  onReady: () => void;
}) {
  const t = useTranslations('viewer');
  const loadingText = isWebRtc
    ? t('status.negotiatingWebRtc')
    : t('status.establishingChannel');

  return (
    <div className="absolute inset-0 pt-12">
      <iframe
        src={url}
        title={`${workspaceName} — ${isWebRtc ? 'WebRTC/H.264' : t('status.liveStream')}`}
        onLoad={onReady}
        className="size-full border-0 bg-anthracite-950"
        // Neko/KasmVNC both need scripts + clipboard/pointer/fullscreen + WebRTC media.
        allow="fullscreen; clipboard-read; clipboard-write; autoplay; microphone; camera; display-capture"
        allowFullScreen
      />
      {!ready && (
        <div className="absolute inset-0 top-12 flex flex-col items-center justify-center gap-3 bg-aurora">
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
          <ChistaMark className="size-14 animate-pulse" />
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
 * resolve (typically the default chista.local). Shown instead of letting the
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
 * (mock mode without NEXT_PUBLIC_DEMO_STREAM_URL). Keeps the launch → stream
 * flow demonstrable and tells the operator exactly how to wire a real one.
 */
function PlaceholderStream({ workspaceName, clock }: { workspaceName: string; clock: string }) {
  const t = useTranslations('viewer');

  return (
    <div className="absolute inset-0 pt-12">
      <div className="relative size-full bg-[radial-gradient(120%_120%_at_30%_10%,#23234a_0%,#14141f_55%,#0e0e1a_100%)]">
        <div className="absolute inset-0 bg-grid opacity-30" />
        <ChistaMark className="absolute left-1/2 top-1/2 size-72 -translate-x-1/2 -translate-y-1/2 opacity-[0.05]" />

        <div className="absolute left-1/2 top-1/2 w-[min(880px,86vw)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border border-white/10 shadow-[var(--shadow-lifted)]">
          <div className="flex items-center gap-2 bg-anthracite-800/90 px-4 py-2.5 backdrop-blur">
            <span className="size-3 rounded-full bg-error-500/80" />
            <span className="size-3 rounded-full bg-warn-500/80" />
            <span className="size-3 rounded-full bg-success-500/80" />
            <span className="ml-3 text-xs text-muted-foreground">{workspaceName}</span>
          </div>
          <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 bg-anthracite-900/80 p-12 text-center backdrop-blur">
            <Check className="size-10 rounded-full bg-success/15 p-2 text-success" />
            <p className="font-display text-xl">{t('status.placeholderLive')}</p>
            <p className="max-w-md text-sm text-muted-foreground">
              {t('status.placeholderDescription', { name: workspaceName })}
            </p>
            <pre dir="ltr" className="mt-1 overflow-x-auto rounded-md border border-border-subtle bg-anthracite-950/80 px-4 py-3 text-left text-[11px] leading-relaxed text-muted-foreground">
              {`docker run --rm -p 6901:6901 \\
  -e VNC_PW=password kasmweb/firefox:1.16.0-rolling

# .env
NEXT_PUBLIC_DEMO_STREAM_URL=https://localhost:6901`}
            </pre>
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 flex h-11 items-center gap-3 bg-anthracite-800/80 px-4 backdrop-blur-xl">
          <button className="flex items-center gap-2 rounded-md px-2 py-1 text-xs hover:bg-white/5">
            <ChistaMark className="size-4" /> {t('status.start')}
          </button>
          <div className="ms-auto flex items-center gap-3 text-xs text-muted-foreground">
            <Wifi className="size-3.5 text-success" />
            <span className="tnum">{clock}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
