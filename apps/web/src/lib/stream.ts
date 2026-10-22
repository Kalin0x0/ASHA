/**
 * Streaming-viewer URL resolution.
 *
 * KasmVNC images ship their own browser-based client (HTTPS on :6901), so the
 * streaming viewer embeds that origin directly in an <iframe> — no noVNC/RFB
 * client needs to be bundled.
 *
 * In `live` mode the API's `GET /sessions/:id/connection` returns the real,
 * per-session URL (built by `@asha/proxy-labels` and routed through Traefik).
 * For local development against the mock store, point a single running KasmVNC
 * container at the viewer:
 *
 *   docker run --rm -p 6901:6901 -e VNC_PW=password kasmweb/firefox:1.16.0-rolling
 *   # then in .env:
 *   NEXT_PUBLIC_DEMO_STREAM_URL=https://localhost:6901
 *
 * When the variable is unset the viewer falls back to a branded placeholder
 * surface so the launch → stream flow is still demonstrable without Docker.
 */

/** Normalised demo stream base URL, or '' when unset. */
function streamBase(): string {
  return (process.env.NEXT_PUBLIC_DEMO_STREAM_URL ?? '').trim().replace(/\/+$/, '');
}

/** True when a real KasmVNC endpoint is configured for the mock/demo flow. */
export function isStreamConfigured(): boolean {
  return streamBase().length > 0;
}

/**
 * Resolves the URL embedded by the streaming viewer for a given session.
 * Returns `undefined` when no stream endpoint is configured, in which case the
 * viewer renders its placeholder surface instead of an <iframe>.
 */
export function resolveStreamUrl(kasmId?: string): string | undefined {
  const base = streamBase();
  if (!base) return undefined;
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    return undefined;
  }
  // A bare origin (e.g. https://localhost:6901) points straight at one KasmVNC
  // web client; embed it as-is. A base that already carries a path is treated
  // as the Traefik proxy that path-routes each session under /session/<id>/.
  if (kasmId && url.pathname !== '/') {
    return `${base}/session/${kasmId}/`;
  }
  return base;
}

/**
 * Heuristic: will this stream URL fail to resolve from the user's browser?
 * Returns true when the host is the non-public default `*.local` dev domain AND
 * the browser is not already being served from that host. The viewer uses this
 * to show a clear, actionable error instead of a raw browser DNS failure
 * ("<host>'s server IP address could not be found"). Unparseable URLs return
 * false so the iframe is still attempted rather than pre-emptively blocked.
 */
export function isLikelyUnreachableUrl(url: string, currentHost?: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  const current = (currentHost ?? '').toLowerCase();
  if (current && host === current) return false; // served from this host → it resolves
  return host.endsWith('.local');
}

/**
 * Turn KasmVNC's clipboard on for an embedded stream.
 *
 * Inside an iframe the KasmVNC client assumes Kasm Workspaces is driving it and
 * defaults clipboard up, down and seamless to OFF unless the URL says otherwise
 * (`isInsideKasmVDI` in its ui.js). Asha never said otherwise, so copy and paste
 * was dead in every container, in both directions and inside the desktop too.
 * A direction the DLP policy forbids stays off here — and the container is
 * started with that direction disabled as well, which is the enforcing half.
 */
export function withClipboard(url: string, dlp: { clipboardUp?: boolean; clipboardDown?: boolean }): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return url;
  }
  const up = dlp.clipboardUp !== false;
  const down = dlp.clipboardDown !== false;
  u.searchParams.set('clipboard_up', String(up));
  u.searchParams.set('clipboard_down', String(down));
  u.searchParams.set('clipboard_seamless', String(up && down));
  return u.toString();
}
