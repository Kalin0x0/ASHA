'use client';

import Guacamole, { type Client as GuacClient } from 'guacamole-common-js';
import {
  ArrowLeft,
  Camera,
  ClipboardPaste,
  Command,
  Eye,
  Gauge,
  LayoutGrid,
  Loader2,
  Maximize2,
  Monitor,
  MonitorX,
  Power,
  RefreshCw,
  Share2,
  Wifi,
  X,
} from 'lucide-react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AppIcon } from '@/components/composite/app-icon';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { getAccessToken } from '@/lib/api/auth-store';
import { captureCanvasThumb } from '@/lib/capture-thumb';
import { useSessions, useWorkspaces } from '@/lib/hooks';
import { useThumbnails } from '@/lib/thumbnail-store';
import { useKeepalive } from '@/lib/use-keepalive';
import { cn } from '@/lib/utils';

// X11 keysyms for the control-menu shortcuts.
const KEYSYM = { CTRL: 0xffe3, ALT: 0xffe9, DEL: 0xffff, V: 0x0076 } as const;

// Resolution presets for the toolbar (w:0 = fit the window).
const RESOLUTIONS = [
  { label: 'Fit window', w: 0, h: 0 },
  { label: '1280 × 720', w: 1280, h: 720 },
  { label: '1920 × 1080', w: 1920, h: 1080 },
  { label: '2560 × 1440', w: 2560, h: 1440 },
  { label: '3840 × 2160', w: 3840, h: 2160 },
];

/** A toolbar icon button with a tooltip (all wired to real guacamole actions). */
function ToolBtn({
  icon: Icon,
  label,
  onClick,
  active,
}: {
  icon: typeof Camera;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-label={label}
          className={cn(
            'inline-flex size-9 items-center justify-center rounded-md transition-colors ring-gold-focus',
            active ? 'bg-gold-500/15 text-gold-300' : 'text-muted-foreground hover:bg-white/10 hover:text-foreground',
          )}
        >
          <Icon className="size-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

// Cap on automatic reconnect attempts before the viewer falls back to a manual
// "Reconnect" button.
const MAX_AUTO_RECONNECTS = 8;

type ViewState = 'connecting' | 'connected' | 'disconnected' | 'error';

/** Full-viewport Guacamole (RDP/VNC/SSH) remote-desktop viewer. The proxy drives
 *  the guacd handshake server-side; here we just stream + relay input. */
export default function ConnectPage() {
  const params = useParams<{ kasmId: string }>();
  const router = useRouter();
  const kasmId = params?.kasmId ?? '';
  // View-only "watch" mode (admin monitoring): the stream renders but no
  // keyboard/mouse/clipboard input is forwarded, so the user isn't disturbed.
  const searchParams = useSearchParams();
  const monitor = searchParams?.get('monitor') === '1';

  const containerRef = useRef<HTMLDivElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const clientRef = useRef<GuacClient | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  // Set while connected: pushes a string to the remote clipboard (local → remote).
  const sendClipboardRef = useRef<((text: string) => void) | null>(null);
  const [state, setState] = useState<ViewState>('connecting');
  const [errMsg, setErrMsg] = useState('');
  const [attempt, setAttempt] = useState(0);
  // Performance mode = the "Windows optimization": wallpaper/effects OFF to save
  // bandwidth. Persisted; toggling it reconnects with the new RDP experience.
  const [perfMode, setPerfMode] = useState(
    () => typeof window !== 'undefined' && window.localStorage.getItem('asha-rdp-perf') === '1',
  );
  // Forced resolution (null = fit the viewport). Changing it reconnects.
  const [resOverride, setResOverride] = useState<{ w: number; h: number } | null>(null);
  const [resMenuOpen, setResMenuOpen] = useState(false);
  // Auto-reconnect bookkeeping: capped exponential backoff on a transient drop
  // or a "not ready yet" race. Reset to 0 once solidly connected.
  const [autoAttempts, setAutoAttempts] = useState(0);

  // Resolve the session → workspace so the toolbar shows the name + description.
  const session = useSessions().find((s) => s.kasmId === kasmId);
  const workspaces = useWorkspaces();
  const ws = workspaces.find((w) => w.friendlyName === session?.workspaceName);
  const workspaceName = session?.workspaceName ?? 'Remote desktop';
  const workspaceDescription = ws?.description;
  const protocolLabel = session?.connectionType ?? 'RDP';
  const connected = state === 'connected';

  // Keep the session alive while connected so the idle reaper never terminates a
  // desktop the user is actively using (previously NOTHING refreshed keepalive).
  useKeepalive(session?.id, connected);

  useEffect(() => {
    const token = getAccessToken();
    const screen = screenRef.current;
    if (!token) {
      setErrMsg('Not signed in.');
      setState('error');
      return;
    }
    if (!kasmId || !screen) return;

    const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
    // Request the remote desktop at the current viewport size so it fills the
    // window with no letterbox bars (clamped + rounded to even pixels).
    const clampEven = (v: number, lo: number, hi: number) =>
      Math.max(lo, Math.min(hi, Math.round(v / 2) * 2));
    const reqW = clampEven(resOverride?.w ?? screen.clientWidth ?? 1280, 640, 3840);
    const reqH = clampEven(resOverride?.h ?? screen.clientHeight ?? 720, 480, 2160);
    const url = `${scheme}://${window.location.host}/proxy/session/${encodeURIComponent(
      kasmId,
    )}?token=${encodeURIComponent(token)}&w=${reqW}&h=${reqH}&perf=${perfMode ? 1 : 0}`;

    const tunnel = new Guacamole.WebSocketTunnel(url);
    const client = new Guacamole.Client(tunnel);
    clientRef.current = client;

    const display = client.getDisplay();
    const el = display.getElement();
    screen.replaceChildren(el);

    // Scale the remote desktop to fit the viewport (letterboxed); rescale when the
    // remote resolution changes or the window resizes.
    const rescale = () => {
      const w = display.getWidth();
      const h = display.getHeight();
      if (w > 0 && h > 0 && screen.clientWidth > 0 && screen.clientHeight > 0) {
        display.scale(Math.min(screen.clientWidth / w, screen.clientHeight / h));
      }
    };
    display.onresize = rescale;
    // On window resize, ask the RDP session to adopt the new viewport size
    // (dynamic resolution via resize-method=display-update); the resulting
    // size,0 from guacd then triggers rescale. Debounced to avoid flooding.
    let resizeTimer: ReturnType<typeof setTimeout> | undefined;
    const onWindowResize = () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const w = clampEven(screen.clientWidth || reqW, 640, 3840);
        const h = clampEven(screen.clientHeight || reqH, 480, 2160);
        try {
          client.sendSize(w, h);
        } catch {
          /* not connected yet */
        }
        rescale();
      }, 250);
    };
    window.addEventListener('resize', onWindowResize);
    rescale();

    client.onstatechange = (s) => {
      if (s === 3) setState('connected'); // CONNECTED
      else if (s === 5) setState((prev) => (prev === 'error' ? 'error' : 'disconnected')); // DISCONNECTED
    };
    client.onerror = (status) => {
      setErrMsg(status?.message || 'The remote connection failed.');
      setState('error');
      try {
        client.disconnect();
      } catch {
        /* already closed */
      }
    };

    // Mouse → server. Coordinates come in viewport pixels; divide by the display
    // scale so clicks land at the correct remote position.
    const mouse = new Guacamole.Mouse(el);
    const sendMouse = (s: { x: number; y: number }) => {
      const sc = display.getScale() || 1;
      client.sendMouseState({ ...s, x: s.x / sc, y: s.y / sc });
    };
    // Keyboard → server (whole document so shortcuts reach the desktop).
    const keyboard = new Guacamole.Keyboard(document);
    // In view-only monitor mode we deliberately attach NO input handlers, so the
    // admin can watch without sending a single keystroke or click to the user.
    if (!monitor) {
      mouse.onmousedown = sendMouse;
      mouse.onmouseup = sendMouse;
      mouse.onmousemove = sendMouse;
      keyboard.onkeydown = (keysym) => {
        client.sendKeyEvent(1, keysym);
      };
      keyboard.onkeyup = (keysym) => client.sendKeyEvent(0, keysym);
    }

    // Clipboard: remote → local. When the remote clipboard changes, mirror it
    // into the OS clipboard so "copy on the desktop → paste locally" works.
    client.onclipboard = (stream, mimetype) => {
      if (!mimetype.startsWith('text/')) return;
      const reader = new Guacamole.StringReader(stream);
      let data = '';
      reader.ontext = (t) => {
        data += t;
      };
      reader.onend = () => {
        navigator.clipboard.writeText(data).catch(() => {
          /* clipboard write denied — ignore */
        });
      };
    };
    // Clipboard: local → remote. Used by the toolbar "Paste" button and the
    // best-effort focus sync below.
    sendClipboardRef.current = (text: string) => {
      try {
        const out = client.createClipboardStream('text/plain');
        const writer = new Guacamole.StringWriter(out);
        writer.sendText(text);
        writer.sendEnd();
      } catch {
        /* not connected */
      }
    };
    // When the window regains focus, push the local clipboard to the remote so a
    // plain Ctrl+V inside the desktop works too (best-effort; may be blocked).
    const onFocus = () => {
      navigator.clipboard
        .readText()
        .then((t) => {
          if (t) sendClipboardRef.current?.(t);
        })
        .catch(() => {
          /* clipboard read denied — the toolbar Paste button still works */
        });
    };
    window.addEventListener('focus', onFocus);

    setState('connecting');
    setErrMsg('');
    try {
      client.connect();
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : 'Could not open the tunnel.');
      setState('error');
    }

    return () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      window.removeEventListener('resize', onWindowResize);
      window.removeEventListener('focus', onFocus);
      display.onresize = null;
      keyboard.onkeydown = null;
      keyboard.onkeyup = null;
      mouse.onmousedown = mouse.onmouseup = mouse.onmousemove = null;
      client.onclipboard = null;
      sendClipboardRef.current = null;
      try {
        client.disconnect();
      } catch {
        /* noop */
      }
      clientRef.current = null;
    };
  }, [kasmId, attempt, perfMode, monitor, resOverride]);

  const togglePerf = useCallback(() => {
    setPerfMode((p) => {
      const next = !p;
      try {
        window.localStorage.setItem('asha-rdp-perf', next ? '1' : '0');
      } catch {
        /* storage unavailable */
      }
      return next;
    });
  }, []);

  const reconnect = useCallback(() => {
    setErrMsg('');
    setState('connecting');
    setAttempt((a) => a + 1);
  }, []);

  // Reset the auto-reconnect counter once we're solidly connected.
  useEffect(() => {
    if (state === 'connected') setAutoAttempts(0);
  }, [state]);

  // Auto-reconnect with capped exponential backoff on an unexpected drop OR a
  // "not ready yet" failure: the agent may not have published the proxy record
  // the instant the viewer opened, and guacd / connection-proxy can be briefly
  // restarted (e.g. by a maintenance task). Stops once the session is terminal
  // or the cap is reached, after which the manual "Reconnect" button takes over.
  const sessionStatus = session?.status;
  useEffect(() => {
    if (state !== 'disconnected' && state !== 'error') return;
    if (sessionStatus && ['ERROR', 'DESTROYED', 'TERMINATING', 'PAUSED'].includes(sessionStatus)) return;
    if (autoAttempts >= MAX_AUTO_RECONNECTS) return;
    const delay = Math.min(1000 * 2 ** autoAttempts, 8000);
    const timer = setTimeout(() => {
      setAutoAttempts((a) => a + 1);
      reconnect();
    }, delay);
    return () => clearTimeout(timer);
  }, [state, autoAttempts, sessionStatus, reconnect]);

  /** Send Ctrl+Alt+Del — essential for the Windows lock/login screen. */
  const sendCtrlAltDel = useCallback(() => {
    const c = clientRef.current;
    if (!c || monitor) return;
    c.sendKeyEvent(1, KEYSYM.CTRL);
    c.sendKeyEvent(1, KEYSYM.ALT);
    c.sendKeyEvent(1, KEYSYM.DEL);
    c.sendKeyEvent(0, KEYSYM.DEL);
    c.sendKeyEvent(0, KEYSYM.ALT);
    c.sendKeyEvent(0, KEYSYM.CTRL);
  }, [monitor]);

  /** Copy the local clipboard into the remote, then issue Ctrl+V to paste it. */
  const pasteToRemote = useCallback(async () => {
    const c = clientRef.current;
    if (!c || !sendClipboardRef.current || monitor) return;
    let text = '';
    try {
      text = await navigator.clipboard.readText();
    } catch {
      toast.error('Clipboard access was blocked by the browser.');
      return;
    }
    if (!text) return;
    sendClipboardRef.current(text);
    // Give guacd a beat to apply the clipboard before pasting into the focused app.
    setTimeout(() => {
      c.sendKeyEvent(1, KEYSYM.CTRL);
      c.sendKeyEvent(1, KEYSYM.V);
      c.sendKeyEvent(0, KEYSYM.V);
      c.sendKeyEvent(0, KEYSYM.CTRL);
    }, 80);
    toast.success('Pasted to the remote desktop');
  }, [monitor]);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void el.requestFullscreen().catch(() => {});
  }, []);

  // Snapshot the live desktop so the "My Sessions" switcher shows a real preview.
  const captureThumb = useCallback(() => {
    const dataUrl = captureCanvasThumb(screenRef.current);
    if (dataUrl) useThumbnails.getState().setThumb(kasmId, { dataUrl, capturedAt: new Date().toISOString() });
  }, [kasmId]);

  // Refresh the preview every so often while the desktop is live.
  useEffect(() => {
    if (state !== 'connected') return;
    const id = setInterval(captureThumb, 12_000);
    return () => clearInterval(id);
  }, [state, captureThumb]);

  const disconnect = useCallback(() => {
    captureThumb(); // keep a fresh preview for the switcher
    try {
      clientRef.current?.disconnect();
    } catch {
      /* already closed */
    }
    router.back();
  }, [router, captureThumb]);

  // Download a full-resolution screenshot of the live desktop.
  const screenshot = useCallback(() => {
    const dataUrl = captureCanvasThumb(screenRef.current, 100000); // huge maxW → no downscale
    if (!dataUrl) {
      toast.error('Nothing to capture yet.');
      return;
    }
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${workspaceName.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'desktop'}-${Date.now()}.jpg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast.success('Screenshot saved');
  }, [workspaceName]);

  // Copy a view-only (monitor) link others can watch without sending input.
  const shareMonitorLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/connect/${kasmId}?monitor=1`);
      toast.success('View-only link copied', { description: 'Whoever opens it can watch, but not control.' });
    } catch {
      toast.error('Clipboard access was blocked');
    }
  }, [kasmId]);

  // Switch the remote resolution (reconnects). `null` = fit the window.
  const setResolution = useCallback((res: { w: number; h: number } | null) => {
    setResMenuOpen(false);
    setErrMsg('');
    setState('connecting');
    setResOverride(res);
  }, []);

  return (
    <div ref={containerRef} className="fixed inset-0 z-50 flex flex-col bg-anthracite-950 text-foreground">
      {resMenuOpen && <div className="fixed inset-0 z-40" onClick={() => setResMenuOpen(false)} aria-hidden />}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border-subtle bg-[var(--surface-1)] px-2 sm:px-3">
        <Button variant="ghost" size="icon-sm" onClick={disconnect} aria-label="Back to Workspaces" className="rtl:rotate-180">
          <ArrowLeft className="size-4" />
        </Button>
        <AppIcon
          name={workspaceName}
          dockerImage={ws?.dockerImage}
          category={ws?.category}
          iconUrl={ws?.iconUrl}
          rounded="rounded-lg"
          className="size-8 shrink-0"
        />
        <div className="min-w-0 leading-tight">
          <p className="flex items-center gap-2 truncate text-sm font-semibold text-foreground">
            <span className="truncate">{workspaceName}</span>
            <StatusPill state={state} />
          </p>
          <p className="truncate text-[11px] text-muted-foreground">
            {workspaceDescription || `Live · ${protocolLabel}`}
          </p>
        </div>
        {monitor && (
          <span className="ms-1 inline-flex shrink-0 items-center gap-1.5 rounded-full border border-info/40 bg-info/10 px-2.5 py-1 text-[11px] font-medium text-info">
            <Eye className="size-3.5" /> Nur ansehen
          </span>
        )}

        <div className="ms-auto flex items-center gap-0.5">
          {connected && !monitor && (
            <>
              <ToolBtn icon={ClipboardPaste} label="Paste (local → remote)" onClick={() => void pasteToRemote()} />
              <ToolBtn icon={Command} label="Ctrl + Alt + Del" onClick={sendCtrlAltDel} />
            </>
          )}
          {connected && <ToolBtn icon={Camera} label="Screenshot" onClick={screenshot} />}
          <div className="relative">
            <ToolBtn icon={Monitor} label="Display / resolution" active={resMenuOpen} onClick={() => setResMenuOpen((o) => !o)} />
            {resMenuOpen && (
              <div className="absolute end-0 top-10 z-50 w-44 overflow-hidden rounded-lg border border-border-subtle bg-anthracite-900/95 py-1 shadow-[var(--shadow-lifted)] backdrop-blur">
                <p className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Resolution</p>
                {RESOLUTIONS.map((r) => {
                  const isActive = r.w === 0 ? resOverride === null : resOverride?.w === r.w;
                  return (
                    <button
                      key={r.label}
                      onClick={() => setResolution(r.w === 0 ? null : { w: r.w, h: r.h })}
                      className={cn(
                        'flex w-full items-center gap-2 px-3 py-1.5 text-start text-xs transition-colors hover:bg-secondary',
                        isActive ? 'text-gold-300' : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      <Monitor className="size-3.5" /> {r.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <ToolBtn icon={Gauge} label={perfMode ? 'Quality: performance (effects off)' : 'Quality: full'} active={perfMode} onClick={togglePerf} />
          <ToolBtn icon={Share2} label="Copy view-only link" onClick={() => void shareMonitorLink()} />
          <ToolBtn icon={Maximize2} label="Fullscreen" onClick={toggleFullscreen} />
          <ToolBtn icon={LayoutGrid} label="Control Panel" active={panelOpen} onClick={() => setPanelOpen((o) => !o)} />
          {(state === 'disconnected' || state === 'error') && (
            <Button variant="outline" size="sm" onClick={reconnect} className="ms-1">
              <RefreshCw className="size-3.5" /> <span className="hidden sm:inline">Reconnect</span>
            </Button>
          )}
          <Button variant="destructive" size="sm" onClick={disconnect} title="End session" className="ms-1">
            <Power className="size-3.5" /> <span className="hidden sm:inline">End</span>
          </Button>
        </div>
      </header>

      <main className="relative flex-1 overflow-hidden bg-anthracite-950">
        {/* The guacd display canvas mounts here. `isolate` (+ relative z-0) gives
            this subtree its own stacking context: guacamole-common-js ships the
            default desktop layer canvas with z-index:-1, which would otherwise
            render BEHIND the opaque <main> background (bg-black) → black screen
            with only the cursor (a higher-z layer) visible. The grid centers the
            scaled remote display within the viewport. */}
        <div ref={screenRef} className="relative isolate z-0 grid h-full w-full place-items-center [&_canvas]:block" />
        {state !== 'connected' && <Overlay state={state} errMsg={errMsg} onRetry={reconnect} />}
      </main>

      <ControlPanel
        open={panelOpen}
        onOpen={() => setPanelOpen(true)}
        onClose={() => setPanelOpen(false)}
        connected={state === 'connected'}
        perfMode={perfMode}
        onPaste={() => void pasteToRemote()}
        onCtrlAltDel={sendCtrlAltDel}
        onFullscreen={toggleFullscreen}
        onTogglePerf={togglePerf}
        onReconnect={reconnect}
        onWorkspaces={() => router.push('/')}
        onEnd={disconnect}
      />
    </div>
  );
}

/**
 * Kasm-style slide-out Control Panel for the remote-desktop viewer. A right-edge
 * tab opens a panel of controls that all act on the live guacamole client, so
 * every button works: clipboard paste, Ctrl+Alt+Del, fullscreen, streaming
 * quality (performance mode), reconnect, back to workspaces, and end session.
 */
function ControlPanel({
  open,
  onOpen,
  onClose,
  connected,
  perfMode,
  onPaste,
  onCtrlAltDel,
  onFullscreen,
  onTogglePerf,
  onReconnect,
  onWorkspaces,
  onEnd,
}: {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  connected: boolean;
  perfMode: boolean;
  onPaste: () => void;
  onCtrlAltDel: () => void;
  onFullscreen: () => void;
  onTogglePerf: () => void;
  onReconnect: () => void;
  onWorkspaces: () => void;
  onEnd: () => void;
}) {
  return (
    <>
      {/* Collapsed right-edge tab (always reachable) */}
      {!open && (
        <button
          type="button"
          onClick={onOpen}
          aria-label="Control Panel öffnen"
          className="absolute end-0 top-1/2 z-40 flex -translate-y-1/2 flex-col items-center gap-2 rounded-s-xl border border-e-0 border-border-subtle bg-[var(--surface-1)] px-2 py-3 text-muted-foreground shadow-[var(--shadow-lifted)] transition-colors hover:text-foreground ring-gold-focus"
        >
          <LayoutGrid className="size-4 text-gold-300" />
          <span className="rotate-180 text-[10px] font-medium uppercase tracking-wider [writing-mode:vertical-rl]">
            Control Panel
          </span>
        </button>
      )}

      {/* Slide-out panel */}
      <aside
        aria-hidden={!open}
        className={cn(
          'absolute end-0 top-0 z-50 flex h-full w-[300px] max-w-[85vw] flex-col border-s border-border-subtle bg-[var(--surface-1)] shadow-[var(--shadow-lifted)] transition-transform duration-300 ease-out',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-border-subtle px-4">
          <span className="font-display text-base font-semibold">Control Panel</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Schließen"
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground ring-gold-focus"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          <div className="grid grid-cols-3 gap-2">
            <QuickTile icon={ClipboardPaste} label="Einfügen" onClick={onPaste} disabled={!connected} />
            <QuickTile icon={Command} label="Strg+Alt+Entf" onClick={onCtrlAltDel} disabled={!connected} />
            <QuickTile icon={Maximize2} label="Vollbild" onClick={onFullscreen} />
          </div>

          <div className="mt-3 space-y-1.5">
            <PanelRow
              icon={Gauge}
              title="Streaming-Qualität"
              subtitle={perfMode ? 'Performance-Modus: an' : 'Volle Qualität'}
              onClick={onTogglePerf}
              toggle={perfMode}
            />
            <PanelRow icon={RefreshCw} title="Neu verbinden" subtitle="Sitzung neu aufbauen" onClick={onReconnect} />
            <PanelRow icon={LayoutGrid} title="Arbeitsbereich" subtitle="Diese Sitzung verlassen" onClick={onWorkspaces} />
            <PanelRow
              icon={Power}
              title="Sitzung beenden"
              subtitle="Verbindung trennen"
              onClick={onEnd}
              destructive
            />
          </div>
        </div>
      </aside>
    </>
  );
}

function QuickTile({
  icon: Icon,
  label,
  onClick,
  disabled = false,
}: {
  icon: typeof ClipboardPaste;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex flex-col items-center justify-center gap-1.5 rounded-lg border border-border-subtle bg-[var(--surface-2)] px-2 py-3 text-center transition-colors ring-gold-focus',
        disabled ? 'cursor-not-allowed opacity-40' : 'hover:border-[rgba(212,175,55,0.4)] hover:text-foreground',
      )}
    >
      <Icon className="size-5 text-gold-300" />
      <span className="text-[10px] font-medium leading-tight">{label}</span>
    </button>
  );
}

function PanelRow({
  icon: Icon,
  title,
  subtitle,
  onClick,
  toggle,
  destructive = false,
}: {
  icon: typeof ClipboardPaste;
  title: string;
  subtitle: string;
  onClick: () => void;
  toggle?: boolean;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg border border-border-subtle bg-[var(--surface-2)] px-3 py-2.5 text-start transition-colors ring-gold-focus',
        destructive ? 'hover:border-destructive/50' : 'hover:border-[rgba(212,175,55,0.4)]',
      )}
    >
      <span
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-md',
          destructive ? 'bg-destructive/15 text-destructive' : 'bg-gold-500/10 text-gold-300',
        )}
      >
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block truncate text-[11px] text-muted-foreground">{subtitle}</span>
      </span>
      {toggle !== undefined && (
        <span className={cn('relative h-5 w-9 shrink-0 rounded-full transition-colors', toggle ? 'bg-gold-500' : 'bg-secondary')}>
          <span
            className={cn(
              'absolute top-0.5 size-4 rounded-full bg-white shadow transition-transform',
              toggle ? 'translate-x-[18px]' : 'translate-x-0.5',
            )}
          />
        </span>
      )}
    </button>
  );
}

function StatusPill({ state }: { state: ViewState }) {
  const map: Record<ViewState, { label: string; dot: string; text: string }> = {
    connecting: { label: 'Connecting', dot: 'bg-gold-400 animate-pulse', text: 'text-gold-300' },
    connected: { label: 'Connected', dot: 'bg-emerald-400', text: 'text-emerald-300' },
    disconnected: { label: 'Disconnected', dot: 'bg-muted-foreground', text: 'text-muted-foreground' },
    error: { label: 'Error', dot: 'bg-destructive', text: 'text-destructive' },
  };
  const s = map[state];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-border-subtle px-2.5 py-1 text-xs font-medium ${s.text}`}
    >
      <span className={`size-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

function Overlay({
  state,
  errMsg,
  onRetry,
}: {
  state: ViewState;
  errMsg: string;
  onRetry: () => void;
}) {
  return (
    <div className="absolute inset-0 grid place-items-center bg-anthracite-950/80 backdrop-blur-sm">
      <div className="flex max-w-sm flex-col items-center gap-4 px-6 text-center">
        {state === 'connecting' && (
          <>
            <span className="flex size-14 items-center justify-center rounded-2xl border border-[rgba(212,175,55,0.3)] bg-gold-500/10 text-gold-300">
              <Loader2 className="size-6 animate-spin" />
            </span>
            <div className="space-y-1">
              <h2 className="font-display text-lg font-medium">Establishing connection</h2>
              <p className="text-sm text-muted-foreground">Negotiating the secure RDP tunnel via guacd…</p>
            </div>
          </>
        )}
        {state === 'disconnected' && (
          <>
            <span className="flex size-14 items-center justify-center rounded-2xl border border-border-subtle bg-secondary text-muted-foreground">
              <Wifi className="size-6" />
            </span>
            <div className="space-y-1">
              <h2 className="font-display text-lg font-medium">Session ended</h2>
              <p className="text-sm text-muted-foreground">The remote host closed the connection.</p>
            </div>
            <Button variant="outline" size="sm" onClick={onRetry}>
              <RefreshCw className="size-3.5" />
              Reconnect
            </Button>
          </>
        )}
        {state === 'error' && (
          <>
            <span className="flex size-14 items-center justify-center rounded-2xl border border-[rgba(240,97,109,0.3)] bg-destructive/10 text-destructive">
              <MonitorX className="size-6" />
            </span>
            <div className="space-y-1">
              <h2 className="font-display text-lg font-medium">Couldn&apos;t connect</h2>
              <p className="text-sm text-muted-foreground">{errMsg || 'The remote connection failed.'}</p>
            </div>
            <Button variant="outline" size="sm" onClick={onRetry}>
              <RefreshCw className="size-3.5" />
              Try again
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
