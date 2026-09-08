'use client';

import Guacamole, { type Client as GuacClient } from 'guacamole-common-js';
import {
  ArrowLeft,
  Camera,
  ClipboardPaste,
  Command,
  Eye,
  Gauge,
  Keyboard as KeyboardIcon,
  LayoutGrid,
  Loader2,
  Maximize2,
  Monitor,
  MonitorX,
  Power,
  RefreshCw,
  Wifi,
  X,
  ZoomOut,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AppIcon } from '@/components/composite/app-icon';
import { ObservationNotice } from '@/components/composite/observation-notice';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { TouchKeyBar } from '@/components/viewer/touch-key-bar';
import { ApiError } from '@/lib/api/client';
import { terminateSession } from '@/lib/api/endpoints';
import { getAccessToken } from '@/lib/api/auth-store';
import { isLive } from '@/lib/api/mode';
import { captureCanvasThumb } from '@/lib/capture-thumb';
import { useLaunchableWorkspaces, useOwnSessions, useSessions } from '@/lib/hooks';
import { useThumbnails } from '@/lib/thumbnail-store';
import { attachTouchInput, isTouchDevice } from '@/lib/touch-input';
import { forwardsToRemote } from '@/lib/remote-keys';
import { attachTextEntry } from '@/lib/touch-keyboard';
import { useSessionObserved } from '@/lib/realtime';
import { planSessionExit } from '@/lib/session-exit';
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
  className,
}: {
  icon: typeof Camera;
  label: string;
  onClick: () => void;
  active?: boolean;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-label={label}
          className={cn(
            // 44px on touch, the compact 36px once there is a pointer.
            'inline-flex size-11 items-center justify-center rounded-md transition-colors ring-gold-focus sm:size-9',
            className,
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
// If the stream hasn't reached 'connected' within this window, surface a clear
// error instead of an endless "Establishing connection" spinner. Covers a stuck
// remote RDP/NLA handshake (e.g. missing/blocked credentials) that the proxy's
// own guacd timeout can't see once the proxy↔guacd handshake itself completed.
const CONNECT_WATCHDOG_MS = 18_000;

type ViewState = 'connecting' | 'connected' | 'disconnected' | 'error';

/** Full-viewport Guacamole (RDP/VNC/SSH) remote-desktop viewer. The proxy drives
 *  the guacd handshake server-side; here we just stream + relay input. */
export default function ConnectPage() {
  const params = useParams<{ kasmId: string }>();
  const router = useRouter();
  const confirm = useConfirm();
  const t = useTranslations('viewer');
  const kasmId = params?.kasmId ?? '';
  // View-only "watch" mode (admin monitoring): the stream renders but no
  // keyboard/mouse/clipboard input is forwarded, so the user isn't disturbed.
  const searchParams = useSearchParams();
  // A watch token is what actually buys view-only access: the proxy grants the
  // stream on its `mode: 'view'` claim and drops every input instruction, so an
  // observer cannot reach the desktop even by editing the URL. `monitor=1`
  // stays only as the client-side hint that keeps this page's own input
  // handlers detached; on its own it authorizes nothing.
  const watchToken = searchParams?.get('watch') ?? null;
  const monitor = searchParams?.get('monitor') === '1' || watchToken !== null;

  const containerRef = useRef<HTMLDivElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const clientRef = useRef<GuacClient | null>(null);
  // Hidden, focusable "clipboard sink" kept focused over the canvas so the
  // browser fires permission-free `paste` events on Ctrl+V (a <canvas> can't be
  // a paste target, so without this local→remote paste silently never captures).
  const sinkRef = useRef<HTMLTextAreaElement>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  // Set while connected: pushes a string to the remote clipboard (local → remote).
  const sendClipboardRef = useRef<((text: string) => void) | null>(null);
  // Last clipboard text synced in EITHER direction — guards against echoing the
  // remote's own clipboard back to it (would loop) and re-sending unchanged text.
  const lastClipRef = useRef<string>('');
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
  // Set the moment the user CHOOSES to leave (Back / End), before we tear the
  // client down. Our own disconnect() drives guacamole to state 5, which is
  // indistinguishable from a network drop — so without this the auto-reconnect
  // below would race the exit and rebuild the tunnel we just closed, which is
  // what users saw as "End/Back just reloads the session".
  const leavingRef = useRef(false);
  // Touch mode is decided after mount: reading it during render would make the
  // server-rendered markup disagree with the client's.
  const [touch, setTouch] = useState(false);
  useEffect(() => setTouch(isTouchDevice()), []);
  // On-screen key bar + soft keyboard. Held in a ref as well because the resize
  // handler inside the connection effect has to see the current value.
  const [kbOpen, setKbOpen] = useState(false);
  const kbOpenRef = useRef(false);
  kbOpenRef.current = kbOpen;
  // Read inside the connection effect, which must not depend on either value.
  const touchRef = useRef(false);
  touchRef.current = touch;
  // Pinch zoom. `userZoomed` stops the automatic fit from undoing a zoom the
  // user chose when the remote or the window resizes.
  const [zoom, setZoom] = useState(1);
  const userZoomedRef = useRef(false);
  const setDisplayScaleRef = useRef<((scale: number) => void) | null>(null);
  const fitScaleRef = useRef<(() => number) | null>(null);

  // Resolve the session → workspace so the toolbar shows the name + description.
  // Check BOTH the admin list (/sessions, admins only) and the owner list
  // (/sessions/mine, everyone): a normal user can't read the admin list, so
  // without the own-sessions fallback `session` was undefined for them and the
  // End button had no id to terminate (and keepalive never fired).
  const adminSessions = useSessions();
  const ownSessions = useOwnSessions();
  const session = useMemo(
    () => adminSessions.find((s) => s.kasmId === kasmId) ?? ownSessions.find((s) => s.kasmId === kasmId),
    [adminSessions, ownSessions, kasmId],
  );
  const workspaces = useLaunchableWorkspaces();
  const ws = workspaces.find((w) => w.friendlyName === session?.workspaceName);
  const workspaceName = session?.workspaceName ?? 'Remote desktop';
  const workspaceDescription = ws?.description;
  const protocolLabel = session?.connectionType ?? 'RDP';
  const connected = state === 'connected';
  // Only offer "fit to screen" while actually pinched in, so the control isn't
  // dead weight in every session.
  const zoomed = touch && zoom > (fitScaleRef.current?.() ?? Infinity) * 1.02;

  // Keep the session alive while connected so the idle reaper never terminates a
  // desktop the user is actively using (previously NOTHING refreshed keepalive).
  useKeepalive(session?.id, connected);

  // Told to whoever is at this desktop while an administrator watches it.
  const observed = useSessionObserved(session?.id);

  // Explain the gestures once per device: "hold for a right click" and "two
  // fingers to scroll" are otherwise invisible affordances.
  useEffect(() => {
    if (!touch || !connected || monitor) return;
    try {
      if (window.localStorage.getItem('asha-touch-hint') === '1') return;
      window.localStorage.setItem('asha-touch-hint', '1');
    } catch {
      /* storage unavailable — showing the hint again is harmless */
    }
    toast(t('connect.touch.hintTitle'), { description: t('connect.touch.hint'), duration: 8000 });
  }, [touch, connected, monitor, t]);

  // Follow the visual viewport while the soft keyboard is open. `interactive-widget`
  // in the viewport meta handles this on Chromium, but iOS ignores it: there the
  // layout viewport keeps its full height, so a fixed, full-height container puts
  // the key bar — and the bottom of the desktop — behind the keyboard.
  useEffect(() => {
    const vv = typeof window === 'undefined' ? null : window.visualViewport;
    const el = containerRef.current;
    if (!vv || !el || !kbOpen) return;
    const apply = () => {
      el.style.height = `${vv.height}px`;
      el.style.transform = `translateY(${vv.offsetTop}px)`;
    };
    apply();
    vv.addEventListener('resize', apply);
    vv.addEventListener('scroll', apply);
    return () => {
      vv.removeEventListener('resize', apply);
      vv.removeEventListener('scroll', apply);
      el.style.height = '';
      el.style.transform = '';
    };
  }, [kbOpen]);

  useEffect(() => {
    // An observer streams on the short-lived watch token the API minted for this
    // one session; everyone else streams on their own access token.
    const token = watchToken ?? getAccessToken();
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
    // A new Display starts at scale 1 with no zoom of its own, but the ref
    // describing "the user has zoomed in" survives the effect. Left set from the
    // previous connection it would make the fit below look like a zoom-out and
    // be skipped, stranding the reconnected desktop at 1:1.
    userZoomedRef.current = false;
    screen.scrollTo({ left: 0, top: 0 });

    // Scale the remote desktop to fit the viewport (letterboxed); rescale when the
    // remote resolution changes or the window resizes.
    const fitScale = () => {
      const w = display.getWidth();
      const h = display.getHeight();
      if (w <= 0 || h <= 0 || screen.clientWidth <= 0 || screen.clientHeight <= 0) return 1;
      return Math.min(screen.clientWidth / w, screen.clientHeight / h);
    };
    const rescale = () => {
      const fit = fitScale();
      // A pinch-zoom is the user's decision: a later resize may only raise the
      // floor (so the desktop never ends up smaller than the viewport), never
      // throw the zoom away.
      if (userZoomedRef.current) {
        if (display.getScale() >= fit) return;
        userZoomedRef.current = false;
      }
      display.scale(fit);
      setZoom(fit);
    };
    fitScaleRef.current = fitScale;
    setDisplayScaleRef.current = (s: number) => display.scale(s);
    display.onresize = rescale;
    // On window resize, ask the RDP session to adopt the new viewport size
    // (dynamic resolution via resize-method=display-update); the resulting
    // size,0 from guacd then triggers rescale. Debounced to avoid flooding.
    let resizeTimer: ReturnType<typeof setTimeout> | undefined;
    const onWindowResize = () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        // A soft keyboard sliding in fires the same resize event as a real window
        // change. Resizing the desktop to the few hundred pixels left above the
        // keyboard would reflow every window on it — and undo it on every hide.
        if (!kbOpenRef.current) {
          const w = clampEven(screen.clientWidth || reqW, 640, 3840);
          const h = clampEven(screen.clientHeight || reqH, 480, 2160);
          try {
            client.sendSize(w, h);
          } catch {
            /* not connected yet */
          }
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
      try {
        client.sendMouseState({ ...s, x: s.x / sc, y: s.y / sc });
      } catch {
        /* tunnel not open yet — drop the event */
      }
    };
    // Touch → server. Guacamole.Mouse listens for real mouse events only, so
    // without this a phone can look at the desktop but never touch it.
    // Attached regardless of device: touch events simply never fire under a
    // mouse, whereas gating on the `touch` state would make it a dependency of
    // this effect — which resolves only after mount, so every touch device would
    // open a tunnel, tear it down and open a second one on first paint.
    const detachTouch = monitor
      ? null
      : attachTouchInput({
          viewport: screen,
          display: el,
          send: (s) => {
            try {
              client.sendMouseState(s);
            } catch {
              /* tunnel not open yet — drop the event */
            }
          },
          getScale: () => display.getScale() || 1,
          setScale: (s) => {
            userZoomedRef.current = s > fitScale() + 0.001;
            display.scale(s);
          },
          getFitScale: fitScale,
          onScaleChange: setZoom,
          onLongPress: () => navigator.vibrate?.(12),
        });

    // Keyboard → server (whole document so shortcuts reach the desktop).
    const keyboard = new Guacamole.Keyboard(document);
    // Guacamole throws synchronously (InvalidStateError: WebSocket still in
    // CONNECTING state) if a key event is sent before the tunnel is OPEN — e.g.
    // the user types during the "Establishing connection" phase. Swallow it so an
    // early keystroke can't crash the whole viewer (BugReport ERR-7B8AE804).
    const safeKey = (pressed: 0 | 1, keysym: number) => {
      try {
        clientRef.current?.sendKeyEvent(pressed, keysym);
      } catch {
        /* tunnel not open yet — drop the key */
      }
    };
    // Clipboard paste plumbing (see onPaste below): track Ctrl/Cmd so we can let
    // Ctrl/Cmd+V reach the browser `paste` event (which delivers the clipboard
    // text with NO permission prompt). `pendingPasteV` is a safety net so the V
    // keystroke is never lost if the paste event doesn't fire.
    const PASTE_MODS = new Set([0xffe3, 0xffe4, 0xffe7, 0xffe8]); // L/R Ctrl, L/R Meta(Cmd)
    let modActive = false;
    let pendingPasteV: ReturnType<typeof setTimeout> | null = null;
    // Assigned below, once the key handlers that reference it exist.
    let textEntry: ReturnType<typeof attachTextEntry> | null = null;
    // In view-only monitor mode we deliberately attach NO input handlers, so the
    // admin can watch without sending a single keystroke or click to the user.
    if (!monitor) {
      mouse.onmousedown = sendMouse;
      mouse.onmouseup = sendMouse;
      mouse.onmousemove = sendMouse;
      keyboard.onkeydown = (keysym) => {
        // AltGr is local: forwarding it makes guacd apply the modifier twice and
        // the character never arrives. See lib/remote-keys.
        if (!forwardsToRemote(keysym)) return true;
        if (PASTE_MODS.has(keysym)) modActive = true;
        // Ctrl/Cmd+V: don't send V yet — let the browser `paste` event fire and
        // push the local clipboard to the desktop first; the paste handler then
        // injects V. Fallback timer re-sends V if the paste event never arrives,
        // so the keystroke is never lost (worst case = old remote clipboard).
        if (modActive && (keysym === 0x76 || keysym === 0x56)) {
          if (pendingPasteV) clearTimeout(pendingPasteV);
          pendingPasteV = setTimeout(() => {
            pendingPasteV = null;
            safeKey(1, keysym);
            safeKey(0, keysym);
          }, 60);
          // IMPORTANT: in guacamole-common-js, returning false from onkeydown
          // makes the library call e.preventDefault() (press() returns false →
          // defaultPrevented = !false = true), which CANCELS the browser's
          // default Ctrl+V action and therefore SUPPRESSES the `paste` event we
          // depend on. Return true so the default is NOT prevented and the
          // permission-free `paste` event actually fires into the focused sink.
          return true;
        }
        safeKey(1, keysym);
        return true;
      };
      keyboard.onkeyup = (keysym) => {
        if (!forwardsToRemote(keysym)) return true;
        if (PASTE_MODS.has(keysym)) modActive = false;
        safeKey(0, keysym);
        return true;
      };
    }

    // Soft keyboards mostly do not produce usable key events, so the same hidden
    // sink that captures pastes doubles as the text-entry bridge on touch.
    if (!monitor && sinkRef.current) {
      textEntry = attachTextEntry({
        sink: sinkRef.current,
        tap: (keysym) => {
          safeKey(1, keysym);
          safeKey(0, keysym);
        },
      });
    }

    // ── Bidirectional clipboard bridge (local OS ↔ remote desktop) ──────────
    // Remote → local: when the desktop's clipboard changes, mirror it into the
    // OS clipboard so "copy on the desktop → paste locally" works.
    client.onclipboard = (stream, mimetype) => {
      if (!mimetype.startsWith('text/')) return;
      const reader = new Guacamole.StringReader(stream);
      let data = '';
      reader.ontext = (t) => {
        data += t;
      };
      reader.onend = () => {
        lastClipRef.current = data; // remember so the sync below doesn't echo it back
        navigator.clipboard.writeText(data).catch(() => {
          /* OS clipboard write blocked (unfocused / no permission) — ignore */
        });
      };
    };
    // Local → remote: push text into the desktop's clipboard. Guarded so the
    // remote's OWN clipboard is never echoed back (would loop) and unchanged text
    // isn't re-sent.
    const pushToRemote = (text: string) => {
      if (!text || text === lastClipRef.current) return;
      lastClipRef.current = text;
      try {
        const out = client.createClipboardStream('text/plain');
        const writer = new Guacamole.StringWriter(out);
        writer.sendText(text);
        writer.sendEnd();
      } catch {
        /* not connected yet */
      }
    };
    sendClipboardRef.current = pushToRemote;
    // The browser `paste` event carries the clipboard text synchronously WITHOUT a
    // permission prompt — the most reliable local→remote capture when the user
    // presses Ctrl+V inside the desktop.
    const onPaste = (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData('text/plain');
      // Always swallow the browser default so the pasted text is never inserted
      // into the focused sink textarea — we forward it to the remote ourselves.
      e.preventDefault();
      if (sinkRef.current) sinkRef.current.value = '';
      if (!text || monitor) return;
      // Was this paste actually initiated by Ctrl/Cmd+V? Only then is a modifier
      // held on the remote and only then may we inject V. A paste from anywhere
      // else — the browser's own context menu, a phone's paste bubble — would
      // otherwise type a bare "v" into the desktop.
      const fromCtrlV = pendingPasteV !== null;
      if (pendingPasteV) {
        clearTimeout(pendingPasteV);
        pendingPasteV = null;
      }
      pushToRemote(text);
      // Inject V now that the clipboard is pushed (Ctrl/Cmd is already held on the
      // remote from the physical key) so the desktop pastes the up-to-date text.
      if (fromCtrlV) {
        safeKey(1, 0x76);
        safeKey(0, 0x76);
      }
    };
    document.addEventListener('paste', onPaste);
    // Proactively keep the remote clipboard in sync with the local one — on focus,
    // tab-visibility change, and a light poll while focused — so a plain Ctrl+V
    // inside the desktop pastes the up-to-date text without the per-keystroke race.
    // Best-effort: needs clipboard-read permission (granted once via the toolbar
    // Paste button or the browser prompt); the paste event + toolbar work without it.
    const syncFromLocal = () => {
      // View-only means view only. This poll ran unguarded, so an admin watching
      // someone else's desktop pushed their own clipboard into it every 1.5s.
      if (monitor) return;
      if (typeof document === 'undefined' || !document.hasFocus()) return;
      navigator.clipboard
        .readText()
        .then((t) => pushToRemote(t))
        .catch(() => {
          /* read blocked — covered by the paste event / toolbar Paste button */
        });
    };
    window.addEventListener('focus', syncFromLocal);
    document.addEventListener('visibilitychange', syncFromLocal);
    const clipPoll = window.setInterval(() => {
      // Keep the off-screen sink empty so absorbed keystrokes never accumulate,
      // then run the best-effort local→remote sync.
      if (sinkRef.current) sinkRef.current.value = '';
      syncFromLocal();
    }, 1500);

    // Keep the clipboard sink focused so Ctrl+V produces a `paste` event. Keyboard
    // stays bound to `document`, so this does not affect typing/AltGr — the sink
    // only absorbs the paste. Skipped in view-only monitor mode.
    const focusSink = () => {
      if (monitor) return;
      // On a touch device the sink is focused only while the on-screen keyboard
      // is open. Without this, "hide keyboard" blurred the sink and the blur
      // handler below refocused it a tick later, so the keyboard never closed.
      // (Ctrl+V, the reason the sink is kept focused, needs a hardware keyboard.)
      if (touchRef.current && !kbOpenRef.current) return;
      try {
        sinkRef.current?.focus({ preventScroll: true });
      } catch {
        /* element gone */
      }
    };
    let refocusTimer: ReturnType<typeof setTimeout> | null = null;
    const onSinkBlur = () => {
      // Refocus on the next tick so a click on the desktop re-arms paste capture.
      if (refocusTimer) clearTimeout(refocusTimer);
      refocusTimer = setTimeout(focusSink, 0);
    };
    if (!monitor) {
      sinkRef.current?.addEventListener('blur', onSinkBlur);
      screen.addEventListener('mousedown', focusSink);
      focusSink();
    }

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
      window.removeEventListener('focus', syncFromLocal);
      document.removeEventListener('visibilitychange', syncFromLocal);
      document.removeEventListener('paste', onPaste);
      clearInterval(clipPoll);
      sinkRef.current?.removeEventListener('blur', onSinkBlur);
      screen.removeEventListener('mousedown', focusSink);
      if (refocusTimer) clearTimeout(refocusTimer);
      if (pendingPasteV) clearTimeout(pendingPasteV);
      detachTouch?.();
      textEntry?.detach();
      setDisplayScaleRef.current = null;
      fitScaleRef.current = null;
      display.onresize = null;
      // No-ops rather than null: Guacamole.Keyboard keeps its own `document`
      // listeners after unmount (it has no public teardown), so a keystroke fired
      // after this effect cleans up still calls keyboard.onkeyup(...) — and if
      // that were null the library would throw "onkeyup is not a function"
      // (BugReport ERR-FBABA083). A no-op absorbs the stray event harmlessly.
      const noopKey = () => true;
      keyboard.onkeydown = noopKey;
      keyboard.onkeyup = noopKey;
      try {
        // reset() exists at runtime (guacamole-common-js 1.5) but isn't in the
        // shipped type defs — release any keys still held down.
        (keyboard as unknown as { reset?: () => void }).reset?.();
      } catch {
        /* teardown must never throw */
      }
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
  }, [kasmId, attempt, perfMode, monitor, resOverride, watchToken]);

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

  // Auto-reconnect with capped exponential backoff — ONLY on a clean mid-session
  // drop ('disconnected'), e.g. a transient network blip or a connection-proxy /
  // guacd restart. A hard 'error' (authentication failure, unreachable host,
  // connect-watchdog timeout) is NOT retried automatically: it is shown clearly
  // with a manual "Try again", so a real failure never hides behind an endless
  // "Connecting" spinner. Stops once the session is terminal or the cap is hit.
  const sessionStatus = session?.status;
  useEffect(() => {
    if (state !== 'disconnected') return;
    // The user is on their way out — never fight their own Back/End.
    if (leavingRef.current) return;
    if (sessionStatus && ['ERROR', 'DESTROYED', 'TERMINATING', 'PAUSED'].includes(sessionStatus)) return;
    if (autoAttempts >= MAX_AUTO_RECONNECTS) return;
    const delay = Math.min(1000 * 2 ** autoAttempts, 8000);
    const timer = setTimeout(() => {
      // Re-check on fire, not just on setup: the user may have pressed Back or
      // End during the backoff, and reconnecting here would rebuild the very
      // tunnel they just closed — the "End/Back only reloads the desktop" bug.
      if (leavingRef.current) return;
      setAutoAttempts((a) => a + 1);
      reconnect();
    }, delay);
    return () => clearTimeout(timer);
  }, [state, autoAttempts, sessionStatus, reconnect]);

  // Connect watchdog: a 'connecting' state that never reaches 'connected' (the
  // remote RDP/NLA handshake is stuck) becomes a clear error rather than an
  // endless spinner.
  useEffect(() => {
    if (state !== 'connecting') return;
    const timer = setTimeout(() => {
      setErrMsg(
        'The remote desktop did not respond in time. Check that the server is reachable and its credentials are configured, then try again.',
      );
      setState('error');
    }, CONNECT_WATCHDOG_MS);
    return () => clearTimeout(timer);
  }, [state, attempt]);

  /** Send Ctrl+Alt+Del — essential for the Windows lock/login screen. */
  const sendCtrlAltDel = useCallback(() => {
    const c = clientRef.current;
    if (!c || monitor) return;
    try {
      c.sendKeyEvent(1, KEYSYM.CTRL);
      c.sendKeyEvent(1, KEYSYM.ALT);
      c.sendKeyEvent(1, KEYSYM.DEL);
      c.sendKeyEvent(0, KEYSYM.DEL);
      c.sendKeyEvent(0, KEYSYM.ALT);
      c.sendKeyEvent(0, KEYSYM.CTRL);
    } catch {
      /* tunnel not open — ignore */
    }
  }, [monitor]);

  /** Single keysym down/up for the on-screen key bar. */
  const pressKey = useCallback(
    (pressed: 0 | 1, keysym: number) => {
      if (monitor) return;
      try {
        clientRef.current?.sendKeyEvent(pressed, keysym);
      } catch {
        /* tunnel not open — ignore */
      }
    },
    [monitor],
  );
  const keyDown = useCallback((keysym: number) => pressKey(1, keysym), [pressKey]);
  const keyUp = useCallback((keysym: number) => pressKey(0, keysym), [pressKey]);

  /** Open or close the phone's keyboard. The focus() call has to happen inside
   *  the tap handler — mobile browsers ignore programmatic focus otherwise. */
  const toggleKeyboard = useCallback(() => {
    const next = !kbOpenRef.current;
    // Set the ref before the blur: the sink's blur handler refocuses on the next
    // tick unless it can see that the keyboard is meant to be closed.
    kbOpenRef.current = next;
    setKbOpen(next);
    try {
      if (next) sinkRef.current?.focus({ preventScroll: true });
      else sinkRef.current?.blur();
    } catch {
      /* element gone */
    }
  }, []);

  /** Back to "whole desktop visible" after pinching in. */
  const resetZoom = useCallback(() => {
    const fit = fitScaleRef.current?.();
    if (fit === undefined) return;
    userZoomedRef.current = false;
    setDisplayScaleRef.current?.(fit);
    setZoom(fit);
    screenRef.current?.scrollTo({ left: 0, top: 0 });
  }, []);

  /** Copy the local clipboard into the remote, then issue Ctrl+V to paste it. */
  const pasteToRemote = useCallback(async () => {
    const c = clientRef.current;
    if (!c || !sendClipboardRef.current || monitor) return;
    let text = '';
    try {
      text = await navigator.clipboard.readText();
    } catch {
      toast.error(t('connect.toasts.clipboardBlockedBrowser'));
      return;
    }
    if (!text) return;
    sendClipboardRef.current(text);
    // Give guacd a beat to apply the clipboard before pasting into the focused app.
    setTimeout(() => {
      try {
        c.sendKeyEvent(1, KEYSYM.CTRL);
        c.sendKeyEvent(1, KEYSYM.V);
        c.sendKeyEvent(0, KEYSYM.V);
        c.sendKeyEvent(0, KEYSYM.CTRL);
      } catch {
        /* tunnel not open — ignore */
      }
    }, 80);
    toast.success(t('connect.toasts.pasted'));
  }, [monitor, t]);

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

  // Leave the viewer and return to the workstation. Uses router.push('/'), NOT
  // router.back(): back() is a no-op when the session was opened directly, in a
  // new tab, or after a reload / the RDP router.replace redirect — which is why
  // the Back and End buttons "did nothing". The session keeps running so the
  // user can jump back into it from the workstation.
  const disconnect = useCallback(() => {
    leavingRef.current = true; // before disconnect(): suppress the auto-reconnect
    try {
      captureThumb(); // keep a fresh preview for the switcher (best-effort)
    } catch {
      /* thumbnail capture must never block leaving the viewer */
    }
    try {
      clientRef.current?.disconnect();
    } catch {
      /* already closed */
    }
    router.push('/');
  }, [router, captureThumb]);
  // End = actually terminate the session server-side, then return. AWAITS the
  // DELETE (rather than fire-and-forget before an immediate unmount, which could
  // drop the request) and surfaces a failure as a toast instead of silently
  // doing nothing — the old path swallowed errors, so a 403 (a normal user only
  // has SESSION_TERMINATE_OWN; the endpoint used to demand _ANY) looked like a
  // dead button while the desktop kept running. Navigation always happens.
  const [ending, setEnding] = useState(false);
  const endSession = useCallback(async () => {
    // Confirm BEFORE touching the client: ending is destructive and unrecoverable
    // (Back, right next to it, leaves the desktop running), so a mis-click must
    // cost nothing.
    if (
      !(await confirm({
        title: t('confirmEnd.title'),
        description: t('confirmEnd.description', { name: workspaceName }),
        confirmLabel: t('confirmEnd.confirm'),
      }))
    )
      return;
    // Resolve the id BEFORE anything is torn down. The old code guarded the
    // DELETE with `if (session?.id)` and navigated regardless, so whenever the
    // session lists hadn't resolved this kasmId yet, End quietly did nothing —
    // the user was returned to the workstation convinced they had ended a
    // desktop that in fact kept running (and kept consuming their budget).
    const plan = planSessionExit({ live: isLive, sessionId: session?.id });
    if (plan.action === 'unresolved') {
      toast.error(t('confirmEnd.error'), { description: t('confirmEnd.errorUnresolved') });
      return;
    }

    leavingRef.current = true; // suppress the auto-reconnect for whatever follows
    if (plan.action === 'terminate') {
      // Terminate FIRST, disconnect after it succeeds: a failed DELETE then
      // leaves the user with a live, usable desktop instead of a dead canvas
      // they have to reconnect by hand.
      setEnding(true);
      try {
        await terminateSession(plan.sessionId);
      } catch (e) {
        // Still here, so re-arm the auto-reconnect: the desktop is up and the
        // user may retry or keep working.
        leavingRef.current = false;
        setEnding(false);
        toast.error(t('confirmEnd.error'), {
          description: e instanceof ApiError ? e.message : t('confirmEnd.errorDescription'),
        });
        return; // stay in the viewer so the user sees the error and can retry
      }
    }
    try {
      clientRef.current?.disconnect();
    } catch {
      /* already closed */
    }
    router.push('/');
  }, [router, session?.id, confirm, t, workspaceName]);

  // Download a full-resolution screenshot of the live desktop.
  const screenshot = useCallback(() => {
    const dataUrl = captureCanvasThumb(screenRef.current, 100000); // huge maxW → no downscale
    if (!dataUrl) {
      toast.error(t('connect.toasts.nothingToCapture'));
      return;
    }
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${workspaceName.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'desktop'}-${Date.now()}.jpg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast.success(t('connect.toasts.screenshotSaved'));
  }, [workspaceName, t]);

  // Switch the remote resolution (reconnects). `null` = fit the window.
  const setResolution = useCallback((res: { w: number; h: number } | null) => {
    setResMenuOpen(false);
    setErrMsg('');
    setState('connecting');
    setResOverride(res);
  }, []);

  return (
    <div ref={containerRef} className="fixed inset-0 z-viewer flex flex-col bg-anthracite-950 text-foreground">
      {resMenuOpen && <div className="fixed inset-0 z-40" onClick={() => setResMenuOpen(false)} aria-hidden />}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border-subtle bg-[var(--surface-1)] px-2 sm:px-3">
        <Button variant="ghost" size="icon-sm" onClick={disconnect} aria-label={t('connect.toolbar.backToWorkspaces')} className="shrink-0 rtl:rotate-180">
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
        {/* flex-1 + min-w-0 = basis 0: the title/description yield space to the
            toolbar and truncate, instead of a long workspace description sizing
            this block off its content and squeezing the controls. */}
        <div className="min-w-0 flex-1 leading-tight">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <span className="truncate">{workspaceName}</span>
            <StatusPill state={state} />
          </p>
          <p className="truncate text-[11px] text-muted-foreground">
            {workspaceDescription || `Live · ${protocolLabel}`}
          </p>
        </div>
        {monitor && (
          <span className="ms-1 inline-flex shrink-0 items-center gap-1.5 rounded-full border border-info/40 bg-info/10 px-2.5 py-1 text-[11px] font-medium text-info">
            <Eye className="size-3.5" /> {t('connect.toolbar.viewOnly')}
          </span>
        )}

        <div className="ms-auto flex items-center gap-0.5">
          {/* Touch-only controls: without them a phone cannot type at all, and a
              pinched-in desktop has no way back to "everything visible". */}
          {connected && !monitor && touch && (
            <ToolBtn
              icon={KeyboardIcon}
              label={t('connect.touch.keyboard')}
              active={kbOpen}
              onClick={toggleKeyboard}
            />
          )}
          {connected && touch && zoomed && (
            <ToolBtn icon={ZoomOut} label={t('connect.touch.resetZoom')} onClick={resetZoom} />
          )}
          {connected && !monitor && (
            <>
              <ToolBtn
                icon={ClipboardPaste}
                label={t('connect.toolbar.paste')}
                onClick={() => void pasteToRemote()}
                className={cn(touch && 'hidden sm:inline-flex')}
              />
              <ToolBtn
                icon={Command}
                label={t('connect.toolbar.ctrlAltDel')}
                onClick={sendCtrlAltDel}
                className={cn(touch && 'hidden sm:inline-flex')}
              />
            </>
          )}
          {connected && (
            <ToolBtn
              icon={Camera}
              label={t('connect.toolbar.screenshot')}
              onClick={screenshot}
              className={cn(touch && 'hidden sm:inline-flex')}
            />
          )}
          <div className={cn('relative', touch && 'hidden sm:block')}>
            <ToolBtn icon={Monitor} label={t('connect.toolbar.displayResolution')} active={resMenuOpen} onClick={() => setResMenuOpen((o) => !o)} />
            {resMenuOpen && (
              <div className="absolute end-0 top-10 z-50 w-44 overflow-hidden rounded-lg border border-border-subtle bg-anthracite-900/95 py-1 shadow-[var(--shadow-lifted)] backdrop-blur">
                <p className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{t('connect.toolbar.resolution')}</p>
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
          <ToolBtn icon={Gauge} label={perfMode ? t('connect.toolbar.qualityPerformance') : t('connect.toolbar.qualityFull')} active={perfMode} onClick={togglePerf} />
          <ToolBtn icon={Maximize2} label={t('connect.toolbar.fullscreen')} onClick={toggleFullscreen} />
          <ToolBtn icon={LayoutGrid} label={t('connect.toolbar.controlPanel')} active={panelOpen} onClick={() => setPanelOpen((o) => !o)} />
          {(state === 'disconnected' || state === 'error') && (
            <Button variant="outline" size="sm" onClick={reconnect} className="ms-1">
              <RefreshCw className="size-3.5" /> <span className="hidden sm:inline">{t('connect.toolbar.reconnect')}</span>
            </Button>
          )}
          <Button
            variant="destructive"
            size="sm"
            onClick={() => void endSession()}
            disabled={ending}
            title={t('connect.toolbar.endSession')}
            className="ms-1"
          >
            {ending ? <Loader2 className="size-3.5 animate-spin" /> : <Power className="size-3.5" />}{' '}
            <span className="hidden sm:inline">
              {ending ? t('connect.toolbar.ending') : t('connect.toolbar.end')}
            </span>
          </Button>
        </div>
      </header>

      {observed && <ObservationNotice observed={observed} className="shrink-0" />}

      <main className="relative flex-1 overflow-hidden bg-anthracite-950">
        {/* The guacd display canvas mounts here. `isolate` (+ relative z-0) gives
            this subtree its own stacking context: guacamole-common-js ships the
            default desktop layer canvas with z-index:-1, which would otherwise
            render BEHIND the opaque <main> background (bg-black) → black screen
            with only the cursor (a higher-z layer) visible. The grid centers the
            scaled remote display within the viewport.
            `place-content: safe center` rather than centred items: once a pinch
            makes the desktop larger than the viewport, plain centring would push
            the top-left corner out of reach of any scroll. `touch-none` hands
            every gesture to the touch layer instead of the browser's own
            pan/zoom, and `overscroll-contain` keeps a swipe from triggering
            pull-to-refresh mid-session. */}
        <div
          ref={screenRef}
          className={cn(
            'relative isolate z-0 grid h-full w-full overflow-auto overscroll-contain [place-content:safe_center] [scrollbar-width:none] [&_canvas]:block [&::-webkit-scrollbar]:hidden',
            // Only claim the gestures where we actually handle them. In view-only
            // mode no touch layer is attached, so `touch-none` would just take
            // the browser's own panning away and leave nothing in its place.
            !monitor && 'touch-none',
          )}
        />
        {/* Off-screen, focusable paste target: makes Ctrl+V fire a permission-free
            `paste` event so the local clipboard reaches the remote desktop. On a
            phone it is also what the soft keyboard types into — it has to stay a
            real, focusable field, so it is hidden by opacity rather than by
            `display:none`, which would keep the keyboard from ever opening. */}
        <textarea
          ref={sinkRef}
          aria-hidden
          tabIndex={-1}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          inputMode="text"
          spellCheck={false}
          className="pointer-events-none fixed bottom-0 end-0 size-px resize-none border-0 p-0 opacity-0"
        />
        {state !== 'connected' && <Overlay state={state} errMsg={errMsg} onRetry={reconnect} />}
      </main>

      {kbOpen && connected && !monitor && (
        <TouchKeyBar
          press={keyDown}
          release={keyUp}
          onCtrlAltDel={sendCtrlAltDel}
          onHide={toggleKeyboard}
        />
      )}

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
        onEnd={() => void endSession()}
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
  const t = useTranslations('viewer');
  return (
    <>
      {/* Collapsed right-edge tab (always reachable) */}
      {!open && (
        <button
          type="button"
          onClick={onOpen}
          aria-label={t('connect.panel.open')}
          className="absolute end-0 top-1/2 z-40 flex -translate-y-1/2 flex-col items-center gap-2 rounded-s-xl border border-e-0 border-border-subtle bg-[var(--surface-1)] px-2 py-3 text-muted-foreground shadow-[var(--shadow-lifted)] transition-colors hover:text-foreground ring-gold-focus"
        >
          <LayoutGrid className="size-4 text-gold-300" />
          <span className="rotate-180 text-[10px] font-medium uppercase tracking-wider [writing-mode:vertical-rl]">
            {t('connect.toolbar.controlPanel')}
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
          <span className="font-display text-base font-semibold">{t('connect.toolbar.controlPanel')}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('connect.panel.close')}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground ring-gold-focus"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          <div className="grid grid-cols-3 gap-2">
            <QuickTile icon={ClipboardPaste} label={t('connect.panel.paste')} onClick={onPaste} disabled={!connected} />
            <QuickTile icon={Command} label={t('connect.panel.ctrlAltDel')} onClick={onCtrlAltDel} disabled={!connected} />
            <QuickTile icon={Maximize2} label={t('connect.panel.fullscreen')} onClick={onFullscreen} />
          </div>

          <div className="mt-3 space-y-1.5">
            <PanelRow
              icon={Gauge}
              title={t('connect.panel.qualityTitle')}
              subtitle={perfMode ? t('connect.panel.qualityPerformanceOn') : t('connect.panel.qualityFull')}
              onClick={onTogglePerf}
              toggle={perfMode}
            />
            <PanelRow icon={RefreshCw} title={t('connect.panel.reconnectTitle')} subtitle={t('connect.panel.reconnectSubtitle')} onClick={onReconnect} />
            <PanelRow icon={LayoutGrid} title={t('connect.panel.workspacesTitle')} subtitle={t('connect.panel.workspacesSubtitle')} onClick={onWorkspaces} />
            <PanelRow
              icon={Power}
              title={t('connect.panel.endTitle')}
              subtitle={t('connect.panel.endSubtitle')}
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
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border-subtle px-2.5 py-1 text-xs font-medium ${s.text}`}
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
  const t = useTranslations('viewer');
  return (
    <div className="absolute inset-0 grid place-items-center bg-anthracite-950/80 backdrop-blur-sm">
      <div className="flex max-w-sm flex-col items-center gap-4 px-6 text-center">
        {state === 'connecting' && (
          <>
            <span className="flex size-14 items-center justify-center rounded-2xl border border-[rgba(212,175,55,0.3)] bg-gold-500/10 text-gold-300">
              <Loader2 className="size-6 animate-spin" />
            </span>
            <div className="space-y-1">
              <h2 className="font-display text-lg font-medium">{t('connect.state.connectingTitle')}</h2>
              <p className="text-sm text-muted-foreground">{t('connect.state.connectingDescription')}</p>
            </div>
          </>
        )}
        {state === 'disconnected' && (
          <>
            <span className="flex size-14 items-center justify-center rounded-2xl border border-border-subtle bg-secondary text-muted-foreground">
              <Wifi className="size-6" />
            </span>
            <div className="space-y-1">
              <h2 className="font-display text-lg font-medium">{t('connect.state.endedTitle')}</h2>
              <p className="text-sm text-muted-foreground">{t('connect.state.endedDescription')}</p>
            </div>
            <Button variant="outline" size="sm" onClick={onRetry}>
              <RefreshCw className="size-3.5" />
              {t('connect.toolbar.reconnect')}
            </Button>
          </>
        )}
        {state === 'error' && (
          <>
            <span className="flex size-14 items-center justify-center rounded-2xl border border-[rgba(240,97,109,0.3)] bg-destructive/10 text-destructive">
              <MonitorX className="size-6" />
            </span>
            <div className="space-y-1">
              <h2 className="font-display text-lg font-medium">{t('connect.state.errorTitle')}</h2>
              <p className="text-sm text-muted-foreground">{errMsg || t('connect.state.errorDescription')}</p>
            </div>
            <Button variant="outline" size="sm" onClick={onRetry}>
              <RefreshCw className="size-3.5" />
              {t('connect.state.tryAgain')}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
