/**
 * Builds the contents of a Windows `.rdp` connection file for the native Remote
 * Desktop client (mstsc) — the "RDP Client" launch option (à la Kasm).
 *
 * The native client connects **directly** to the RDP host, so `full address`
 * must be reachable from the user's machine (LAN / VPN / public). The password
 * is intentionally NOT embedded — the native client prompts for it (NLA), which
 * is the secure default and mirrors Kasm's downloadable `.rdp`.
 */
export interface RdpFileOptions {
  /** Target RDP host. A trailing `:port` is respected; otherwise `port` is appended. */
  address: string;
  /** Pre-filled username (supports `DOMAIN\\user`); password is never embedded. */
  username?: string;
  port?: number;
  /** Span the session across all of the user's monitors (default true). */
  multimon?: boolean;
  /** Clipboard redirection — copy/paste both directions (default true). */
  clipboard?: boolean;
  /** Redirect all local drives so local files are reachable (default true). */
  drives?: boolean;
  /** Redirect local printers (default true). */
  printers?: boolean;
  /** Redirect the local microphone (default false). */
  audioCapture?: boolean;
}

function splitDomainUser(input: string): { domain?: string; user: string } {
  const bs = input.indexOf('\\');
  if (bs >= 0) return { domain: input.slice(0, bs), user: input.slice(bs + 1) };
  return { user: input };
}

export function buildRdpFile(opts: RdpFileOptions): string {
  const port = opts.port ?? 3389;
  const fullAddress = /:\d+$/.test(opts.address) ? opts.address : `${opts.address}:${port}`;
  const on = (v: boolean | undefined, dflt: boolean) => ((v ?? dflt) ? 1 : 0);
  const wantDrives = opts.drives ?? true;

  const lines: string[] = [];
  const push = (key: string, value: string | number) => lines.push(`${key}:${value}`);

  push('full address:s', fullAddress);
  if (opts.username) {
    const { domain, user } = splitDomainUser(opts.username);
    push('username:s', user);
    if (domain) push('domain:s', domain);
  }

  // Multi-monitor — show the desktop across every monitor, full screen.
  push('use multimon:i', on(opts.multimon, true));
  push('screen mode id:i', 2); // 2 = full screen
  push('dynamic resolution:i', 1);
  push('smart sizing:i', 1);

  // Copy + paste.
  push('redirectclipboard:i', on(opts.clipboard, true));

  // Access to local data — redirect all local drives (and other devices).
  push('drivestoredirect:s', wantDrives ? '*' : '');
  push('devicestoredirect:s', wantDrives ? '*' : '');
  push('redirectprinters:i', on(opts.printers, true));
  push('redirectcomports:i', 0);
  push('redirectsmartcards:i', 0);

  // Audio — play remote audio locally; optionally redirect the local mic.
  push('audiomode:i', 0);
  push('audiocapturemode:i', on(opts.audioCapture, false));

  // Experience / performance — let the client auto-detect the link.
  push('networkautodetect:i', 1);
  push('bandwidthautodetect:i', 1);
  push('connection type:i', 7);
  push('compression:i', 1);
  push('bitmapcachepersistenable:i', 1);
  push('allow font smoothing:i', 1);
  push('allow desktop composition:i', 1);
  push('disable wallpaper:i', 0);
  push('disable full window drag:i', 0);
  push('disable menu anims:i', 0);
  push('disable themes:i', 0);

  // Connect directly (no RD Gateway in this build) and prompt once for creds.
  push('gatewayusagemethod:i', 0);
  push('promptcredentialonce:i', 1);
  // Don't hard-fail on an unrecognised server certificate (managed hosts).
  push('authentication level:i', 0);

  // `.rdp` files use CRLF line endings.
  return `${lines.join('\r\n')}\r\n`;
}
