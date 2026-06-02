'use client';

import {
  Check,
  Clipboard,
  Loader2,
  Maximize2,
  Power,
  Settings,
  Upload,
  Volume2,
  Wifi,
} from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ChistaMark } from '@/components/brand/logo';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useSession, useTerminateSession } from '@/lib/hooks';
import { cn } from '@/lib/utils';

const STEPS = [
  'Allocating an agent',
  'Pulling workspace image',
  'Starting container',
  'Establishing secure channel',
];

export default function StreamingViewerPage() {
  const params = useParams<{ sessionId: string }>();
  const router = useRouter();
  const session = useSession(params.sessionId);
  const terminate = useTerminateSession();

  const [step, setStep] = useState(0);
  const [connected, setConnected] = useState(false);
  const [clock, setClock] = useState('');

  const workspaceName = session?.workspaceName ?? 'Workspace';

  useEffect(() => {
    if (connected) return;
    if (step >= STEPS.length) {
      const t = setTimeout(() => setConnected(true), 400);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setStep((s) => s + 1), 850);
    return () => clearTimeout(t);
  }, [step, connected]);

  useEffect(() => {
    const tick = () =>
      setClock(new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }));
    tick();
    const i = setInterval(tick, 1000);
    return () => clearInterval(i);
  }, []);

  const disconnect = () => router.push('/');
  const onTerminate = () => {
    if (session) terminate(session.id);
    toast.success('Session ended');
    router.push('/');
  };
  const fullscreen = () => {
    if (typeof document !== 'undefined' && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
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
              connected ? 'text-success' : 'text-warning',
            )}
          >
            <span
              className={cn(
                'size-1.5 rounded-full',
                connected ? 'bg-success animate-pulse-ring' : 'bg-warning',
              )}
            />
            {connected ? 'Connected' : 'Connecting'}
          </span>
        </div>

        {connected && (
          <div className="ml-2 hidden items-center gap-1.5 rounded-md bg-anthracite-900/60 px-2.5 py-1 font-mono text-[11px] text-muted-foreground sm:flex">
            <Wifi className="size-3 text-success" /> 42 ms · 60 fps · {session?.connectionType ?? 'KasmVNC'}
          </div>
        )}

        <div className="ml-auto flex items-center gap-1">
          <ControlButton label="Clipboard" onClick={() => toast('Clipboard synced')}>
            <Clipboard className="size-4" />
          </ControlButton>
          <ControlButton label="Upload file" onClick={() => toast('File upload')}>
            <Upload className="size-4" />
          </ControlButton>
          <ControlButton label="Audio" onClick={() => toast('Audio enabled')}>
            <Volume2 className="size-4" />
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
      <div className="relative flex-1 overflow-hidden">
        {!connected ? (
          <Provisioning step={step} workspaceName={workspaceName} />
        ) : (
          <RemoteDesktop workspaceName={workspaceName} clock={clock} onDisconnect={disconnect} />
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

function Provisioning({ step, workspaceName }: { step: number; workspaceName: string }) {
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

function RemoteDesktop({
  workspaceName,
  clock,
  onDisconnect,
}: {
  workspaceName: string;
  clock: string;
  onDisconnect: () => void;
}) {
  return (
    <div className="absolute inset-0 pt-12">
      {/* Desktop wallpaper */}
      <div className="relative size-full bg-[radial-gradient(120%_120%_at_30%_10%,#23234a_0%,#14141f_55%,#0e0e1a_100%)]">
        <div className="absolute inset-0 bg-grid opacity-30" />
        <ChistaMark className="absolute left-1/2 top-1/2 size-72 -translate-x-1/2 -translate-y-1/2 opacity-[0.05]" />

        {/* Window */}
        <div className="absolute left-1/2 top-1/2 w-[min(880px,86vw)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border border-white/10 shadow-[var(--shadow-lifted)]">
          <div className="flex items-center gap-2 bg-anthracite-800/90 px-4 py-2.5 backdrop-blur">
            <span className="size-3 rounded-full bg-error-500/80" />
            <span className="size-3 rounded-full bg-warn-500/80" />
            <span className="size-3 rounded-full bg-success-500/80" />
            <span className="ml-3 text-xs text-muted-foreground">{workspaceName}</span>
          </div>
          <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 bg-anthracite-900/80 p-12 text-center backdrop-blur">
            <Check className="size-10 rounded-full bg-success/15 p-2 text-success" />
            <p className="font-display text-xl">You&apos;re connected</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              This is a live demo surface for the Chista streaming viewer. With the full stack running, your
              real {workspaceName} container streams here over a secure websocket.
            </p>
          </div>
        </div>

        {/* Taskbar */}
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
