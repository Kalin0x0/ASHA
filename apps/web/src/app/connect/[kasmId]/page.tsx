'use client';

import Guacamole, { type Client as GuacClient } from 'guacamole-common-js';
import { ArrowLeft, Loader2, MonitorX, RefreshCw, Wifi } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { getAccessToken } from '@/lib/api/auth-store';

type ViewState = 'connecting' | 'connected' | 'disconnected' | 'error';

/** Full-viewport Guacamole (RDP/VNC/SSH) remote-desktop viewer. The proxy drives
 *  the guacd handshake server-side; here we just stream + relay input. */
export default function ConnectPage() {
  const params = useParams<{ kasmId: string }>();
  const router = useRouter();
  const kasmId = params?.kasmId ?? '';

  const screenRef = useRef<HTMLDivElement>(null);
  const clientRef = useRef<GuacClient | null>(null);
  const [state, setState] = useState<ViewState>('connecting');
  const [errMsg, setErrMsg] = useState('');
  const [attempt, setAttempt] = useState(0);

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
    const url = `${scheme}://${window.location.host}/proxy/session/${encodeURIComponent(
      kasmId,
    )}?token=${encodeURIComponent(token)}`;

    const tunnel = new Guacamole.WebSocketTunnel(url);
    const client = new Guacamole.Client(tunnel);
    clientRef.current = client;

    const display = client.getDisplay();
    const el = display.getElement();
    screen.replaceChildren(el);

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

    // Mouse → server (param infers as MouseState from the handler signature).
    const mouse = new Guacamole.Mouse(el);
    mouse.onmousedown = (s) => client.sendMouseState(s);
    mouse.onmouseup = (s) => client.sendMouseState(s);
    mouse.onmousemove = (s) => client.sendMouseState(s);

    // Keyboard → server (whole document so shortcuts reach the desktop).
    const keyboard = new Guacamole.Keyboard(document);
    keyboard.onkeydown = (keysym) => {
      client.sendKeyEvent(1, keysym);
    };
    keyboard.onkeyup = (keysym) => client.sendKeyEvent(0, keysym);

    setState('connecting');
    setErrMsg('');
    try {
      client.connect();
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : 'Could not open the tunnel.');
      setState('error');
    }

    return () => {
      keyboard.onkeydown = null;
      keyboard.onkeyup = null;
      mouse.onmousedown = mouse.onmouseup = mouse.onmousemove = null;
      try {
        client.disconnect();
      } catch {
        /* noop */
      }
      clientRef.current = null;
    };
  }, [kasmId, attempt]);

  const reconnect = useCallback(() => {
    setErrMsg('');
    setState('connecting');
    setAttempt((a) => a + 1);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-anthracite-950 text-foreground">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border-subtle bg-[var(--surface-1)] px-3 sm:px-4">
        <Button variant="ghost" size="icon-sm" onClick={() => router.back()} aria-label="Back to servers">
          <ArrowLeft className="size-4" />
        </Button>
        <span className="font-display text-sm font-medium tracking-tight">Remote desktop</span>
        <StatusPill state={state} />
        <div className="ml-auto flex items-center gap-2">
          {(state === 'disconnected' || state === 'error') && (
            <Button variant="outline" size="sm" onClick={reconnect}>
              <RefreshCw className="size-3.5" />
              Reconnect
            </Button>
          )}
        </div>
      </header>

      <main className="relative flex-1 overflow-auto bg-black">
        {/* The guacd display canvas mounts here. */}
        <div ref={screenRef} className="mx-auto w-fit [&_canvas]:block" />
        {state !== 'connected' && <Overlay state={state} errMsg={errMsg} onRetry={reconnect} />}
      </main>
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
