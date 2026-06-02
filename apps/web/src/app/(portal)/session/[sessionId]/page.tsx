'use client';

import {
  AlertTriangle,
  Check,
  Clipboard,
  Loader2,
  Maximize2,
  Power,
  RotateCw,
  Settings,
  Share2,
  Upload,
  Volume2,
  Wifi,
} from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ChistaMark } from '@/components/brand/logo';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { createShare } from '@/lib/api/endpoints';
import { isLive } from '@/lib/api/mode';
import { useSession, useTerminateSession } from '@/lib/hooks';
import { cn } from '@/lib/utils';

const STEPS = [
  'Allocating an agent',
  'Pulling workspace image',
  'Starting container',
  'Establishing secure channel',
];

/** Maps the live session status onto the provisioning checklist index. */
function stepForStatus(status: string | undefined): number {
  switch (status) {
    case 'REQUESTED':
      return 0;
    case 'SCHEDULED':
      return 1;
    case 'PROVISIONING':
      return 3;
    default:
      return 0;
  }
}

export default function StreamingViewerPage() {
  const params = useParams<{ sessionId: string }>();
  const router = useRouter();
  const session = useSession(params.sessionId);
  const terminate = useTerminateSession();

  const stageRef = useRef<HTMLDivElement>(null);
  const [frameReady, setFrameReady] = useState(false);
  const [clock, setClock] = useState('');

  const workspaceName = session?.workspaceName ?? 'Workspace';
  const status = session?.status;
  const isRunning = status === 'RUNNING' || status === 'DEGRADED';
  const isError = status === 'ERROR' || status === 'DESTROYED' || status === 'TERMINATING';
  const connectionUrl = session?.connectionUrl;
  // Connected = the session is live AND its embedded client has finished loading
  // (or there is no real stream to wait on, i.e. the placeholder surface).
  const connected = isRunning && (frameReady || !connectionUrl);

  useEffect(() => {
    const tick = () =>
      setClock(new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }));
    tick();
    const i = setInterval(tick, 1000);
    return () => clearInterval(i);
  }, []);

  // Reset the load gate whenever the embedded URL changes (e.g. reconnect).
  useEffect(() => {
    setFrameReady(false);
  }, [connectionUrl]);

  const disconnect = () => router.push('/');
  const onTerminate = () => {
    if (session) terminate(session.id);
    toast.success('Session ended');
    router.push('/');
  };
  const fullscreen = () => {
    stageRef.current?.requestFullscreen?.().catch(() => {});
  };
  const onShare = async () => {
    if (!session) return;
    if (!isLive) {
      toast('Sharing needs the live backend', {
        description: 'Run with NEXT_PUBLIC_API_MODE=live to generate a real invite link.',
      });
      return;
    }
    try {
      const share = await createShare(session.id, { enableChat: true });
      const link = `${window.location.origin}/share/${share.shareKey}`;
      await navigator.clipboard.writeText(link).catch(() => {});
      toast.success('Share link copied', { description: link });
    } catch {
      toast.error('Could not create share link');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-anthracite-950">
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
            {isError ? 'Disconnected' : connected ? 'Connected' : 'Connecting'}
          </span>
        </div>

        {connected && (
          <div className="ml-2 hidden items-center gap-1.5 rounded-md bg-anthracite-900/60 px-2.5 py-1 font-mono text-[11px] text-muted-foreground sm:flex">
            <Wifi className="size-3 text-success" /> Live · {session?.connectionType ?? 'KasmVNC'}
          </div>
        )}

        <div className="ml-auto flex items-center gap-1">
          <ControlButton label="Clipboard" onClick={() => toast('Use the in-session toolbar for clipboard sync')}>
            <Clipboard className="size-4" />
          </ControlButton>
          <ControlButton label="Upload file" onClick={() => toast('Use the in-session toolbar to upload files')}>
            <Upload className="size-4" />
          </ControlButton>
          <ControlButton label="Audio" onClick={() => toast('Audio is controlled inside the stream')}>
            <Volume2 className="size-4" />
          </ControlButton>
          <ControlButton label="Share session" onClick={onShare}>
            <Share2 className="size-4" />
          </ControlButton>
          <ControlButton label="Settings" onClick={() => toast('Stream settings')}>
            <Settings className="size-4" />
          </ControlButton>
          <ControlButton label="Fullscreen" onClick={fullscreen}>
            <Maximize2 className="size-4" />
          </ControlButton>
          <button
            onClick={onTerminate}
            className="ml-1 inline-flex h-8 items-center gap-1.5 rounded-md bg-destructive/90 px-3 text-xs font-medium text-destructive-foreground transition-colors hover:bg-destructive ring-gold-focus"
          >
            <Power className="size-3.5" /> End
          </button>
        </div>
      </div>

      {/* Stage */}
      <div ref={stageRef} className="relative flex-1 overflow-hidden bg-anthracite-950">
        {isError ? (
          <Disconnected workspaceName={workspaceName} onRetry={() => router.refresh()} onBack={disconnect} />
        ) : !isRunning ? (
          <Provisioning status={status} workspaceName={workspaceName} />
        ) : connectionUrl ? (
          <LiveStream
            url={connectionUrl}
            workspaceName={workspaceName}
            ready={frameReady}
            onReady={() => setFrameReady(true)}
          />
        ) : (
          <PlaceholderStream workspaceName={workspaceName} clock={clock} />
        )}
      </div>
    </div>
  );
}

function ControlButton({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          aria-label={label}
          className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground ring-gold-focus"
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** The real KasmVNC web client, embedded for the running session. */
function LiveStream({
  url,
  workspaceName,
  ready,
  onReady,
}: {
  url: string;
  workspaceName: string;
  ready: boolean;
  onReady: () => void;
}) {
  return (
    <div className="absolute inset-0 pt-12">
      <iframe
        src={url}
        title={`${workspaceName} — live stream`}
        onLoad={onReady}
        className="size-full border-0 bg-anthracite-950"
        // KasmVNC's web client needs scripts, same-origin storage, clipboard and
        // pointer/fullscreen access within its own (trusted) session origin, so
        // the frame is granted those capabilities rather than sandboxed.
        allow="fullscreen; clipboard-read; clipboard-write; autoplay; microphone; camera; display-capture"
        allowFullScreen
      />
      {!ready && (
        <div className="absolute inset-0 top-12 flex flex-col items-center justify-center gap-3 bg-aurora">
          <Loader2 className="size-6 animate-spin text-gold-400" />
          <p className="text-sm text-muted-foreground">Establishing secure channel…</p>
        </div>
      )}
    </div>
  );
}

function Provisioning({ status, workspaceName }: { status: string | undefined; workspaceName: string }) {
  const step = stepForStatus(status);
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-8 bg-aurora">
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <ChistaMark className="size-14 animate-pulse" />
          <span className="absolute -inset-4 rounded-full ring-1 ring-gold-500/20 animate-pulse-ring" />
        </div>
        <div className="text-center">
          <h2 className="font-display text-2xl font-medium">Preparing your workspace</h2>
          <p className="mt-1 text-sm text-muted-foreground">{workspaceName}</p>
        </div>
      </div>

      <ol className="flex w-full max-w-sm flex-col gap-2.5">
        {STEPS.map((label, i) => {
          const done = i < step;
          const active = i === step;
          return (
            <li
              key={label}
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
              {label}
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
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 bg-aurora">
      <AlertTriangle className="size-12 rounded-full bg-destructive/15 p-2.5 text-destructive" />
      <div className="text-center">
        <h2 className="font-display text-2xl font-medium">Session disconnected</h2>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          The stream for {workspaceName} is no longer available. It may have been terminated or timed out.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={onRetry}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-border-subtle px-4 text-sm transition-colors hover:bg-secondary ring-gold-focus"
        >
          <RotateCw className="size-4" /> Retry
        </button>
        <button
          onClick={onBack}
          className="inline-flex h-9 items-center gap-2 rounded-md bg-gold-500/90 px-4 text-sm font-medium text-anthracite-950 transition-colors hover:bg-gold-500 ring-gold-focus"
        >
          Back to workspaces
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
            <p className="font-display text-xl">Session is live</p>
            <p className="max-w-md text-sm text-muted-foreground">
              No stream endpoint is configured, so this is a placeholder. To embed the real{' '}
              {workspaceName} client here, run a KasmVNC container and point the viewer at it:
            </p>
            <pre className="mt-1 overflow-x-auto rounded-md border border-border-subtle bg-anthracite-950/80 px-4 py-3 text-left text-[11px] leading-relaxed text-muted-foreground">
              {`docker run --rm -p 6901:6901 \\
  -e VNC_PW=password kasmweb/firefox:1.16.0-rolling

# .env
NEXT_PUBLIC_DEMO_STREAM_URL=https://localhost:6901`}
            </pre>
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 flex h-11 items-center gap-3 bg-anthracite-800/80 px-4 backdrop-blur-xl">
          <button className="flex items-center gap-2 rounded-md px-2 py-1 text-xs hover:bg-white/5">
            <ChistaMark className="size-4" /> Start
          </button>
          <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
            <Wifi className="size-3.5 text-success" />
            <span className="tnum">{clock}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
