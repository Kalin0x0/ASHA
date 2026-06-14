'use client';

import Guacamole, { type Client as GuacClient } from 'guacamole-common-js';
import { ArrowLeft, ClipboardPaste, Loader2, Maximize2, MonitorX, Power, RefreshCw, Settings, Wifi } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { getAccessToken } from '@/lib/api/auth-store';

// X11 keysyms for the control-menu shortcuts.
const KEYSYM = { CTRL: 0xffe3, ALT: 0xffe9, DEL: 0xffff, V: 0x0076 } as const;

type ViewState = 'connecting' | 'connected' | 'disconnected' | 'error';

/** Full-viewport Guacamole (RDP/VNC/SSH) remote-desktop viewer. The proxy drives
 *  the guacd handshake server-side; here we just stream + relay input. */
export default function ConnectPage() {
  const params = useParams<{ kasmId: string }>();
  const router = useRouter();
  const kasmId = params?.kasmId ?? '';

  const containerRef = useRef<HTMLDivElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const clientRef = useRef<GuacClient | null>(null);
  // Set while connected: pushes a string to the remote clipboard (local → remote).
  const sendClipboardRef = useRef<((text: string) => void) | null>(null);
  const [state, setState] = useState<ViewState>('connecting');
  const [errMsg, setErrMsg] = useState('');
  const [attempt, setAttempt] = useState(0);
  // Performance mode = the "Windows optimization": wallpaper/effects OFF to save
  // bandwidth. Persisted; toggling it reconnects with the new RDP experience.
  const [perfMode, setPerfMode] = useState(
    () => typeof window !== 'undefined' && window.localStorage.getItem('chista-rdp-perf') === '1',
  );

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
    const reqW = clampEven(screen.clientWidth || 1280, 640, 3840);
    const reqH = clampEven(screen.clientHeight || 720, 480, 2160);
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
    mouse.onmousedown = sendMouse;
    mouse.onmouseup = sendMouse;
    mouse.onmousemove = sendMouse;

    // Keyboard → server (whole document so shortcuts reach the desktop).
    const keyboard = new Guacamole.Keyboard(document);
    keyboard.onkeydown = (keysym) => {
      client.sendKeyEvent(1, keysym);
    };
    keyboard.onkeyup = (keysym) => client.sendKeyEvent(0, keysym);

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
  }, [kasmId, attempt, perfMode]);

  const togglePerf = useCallback(() => {
    setPerfMode((p) => {
      const next = !p;
      try {
        window.localStorage.setItem('chista-rdp-perf', next ? '1' : '0');
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

  /** Send Ctrl+Alt+Del — essential for the Windows lock/login screen. */
  const sendCtrlAltDel = useCallback(() => {
    const c = clientRef.current;
    if (!c) return;
    c.sendKeyEvent(1, KEYSYM.CTRL);
    c.sendKeyEvent(1, KEYSYM.ALT);
    c.sendKeyEvent(1, KEYSYM.DEL);
    c.sendKeyEvent(0, KEYSYM.DEL);
    c.sendKeyEvent(0, KEYSYM.ALT);
    c.sendKeyEvent(0, KEYSYM.CTRL);
  }, []);

  /** Copy the local clipboard into the remote, then issue Ctrl+V to paste it. */
  const pasteToRemote = useCallback(async () => {
    const c = clientRef.current;
    if (!c || !sendClipboardRef.current) return;
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
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void el.requestFullscreen().catch(() => {});
  }, []);

  const disconnect = useCallback(() => {
    try {
      clientRef.current?.disconnect();
    } catch {
      /* already closed */
    }
    router.back();
  }, [router]);

  return (
    <div ref={containerRef} className="fixed inset-0 z-50 flex flex-col bg-anthracite-950 text-foreground">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border-subtle bg-[var(--surface-1)] px-3 sm:px-4">
        <Button variant="ghost" size="icon-sm" onClick={() => router.back()} aria-label="Back to servers">
          <ArrowLeft className="size-4" />
        </Button>
        <span className="hidden font-display text-sm font-medium tracking-tight sm:inline">Remote desktop</span>
        <StatusPill state={state} />
        <div className="ml-auto flex items-center gap-1.5">
          {state === 'connected' && (
            <>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => void pasteToRemote()}
                title="Paste local clipboard to the remote (Ctrl+V)"
                aria-label="Paste to remote"
              >
                <ClipboardPaste className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={sendCtrlAltDel}
                title="Send Ctrl+Alt+Del to the remote"
                className="font-mono text-[11px]"
              >
                Ctrl+Alt+Del
              </Button>
              <Button variant="ghost" size="icon-sm" onClick={toggleFullscreen} title="Fullscreen" aria-label="Fullscreen">
                <Maximize2 className="size-4" />
              </Button>
            </>
          )}
          <SettingsMenu perfMode={perfMode} onToggle={togglePerf} />
          {(state === 'disconnected' || state === 'error') && (
            <Button variant="outline" size="sm" onClick={reconnect}>
              <RefreshCw className="size-3.5" />
              Reconnect
            </Button>
          )}
          <Button variant="destructive" size="sm" onClick={disconnect} title="Disconnect">
            <Power className="size-3.5" />
            <span className="hidden sm:inline">End</span>
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
    </div>
  );
}

function SettingsMenu({ perfMode, onToggle }: { perfMode: boolean; onToggle: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => setOpen((o) => !o)}
        aria-label="Anzeige-Einstellungen"
        aria-expanded={open}
      >
        <Settings className="size-4" />
      </Button>
      {open && (
        <>
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-border-subtle bg-[var(--surface-1)] p-1.5 shadow-2xl shadow-black/50">
            <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Anzeige
            </p>
            <button
              type="button"
              role="switch"
              aria-checked={perfMode}
              onClick={() => {
                onToggle();
                setOpen(false);
              }}
              className="group flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(212,175,55,0.5)]"
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-medium">Performance-Modus</span>
                <span className="text-xs leading-snug text-muted-foreground">
                  Windows-Optimierung: Wallpaper &amp; Effekte aus — schneller bei langsamer Verbindung
                </span>
              </span>
              <span
                className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                  perfMode ? 'bg-gold-500' : 'bg-secondary'
                }`}
              >
                <span
                  className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-transform ${
                    perfMode ? 'translate-x-[18px]' : 'translate-x-0.5'
                  }`}
                />
              </span>
            </button>
          </div>
        </>
      )}
    </div>
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
