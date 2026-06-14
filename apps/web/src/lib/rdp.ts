'use client';

import type { RdpFileOptions } from '@/lib/api/endpoints';

/** Trigger a browser download of `.rdp` text content. */
export function downloadRdpFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'application/x-rdp' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.rdp') ? filename : `${filename}.rdp`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick so the download has a chance to start.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Build a representative `.rdp` for **mock mode** (no backend). Mirrors the
 * server-side builder in `apps/api/src/modules/servers/rdp-file.ts` closely
 * enough for the demo; the live path fetches the real file from the API.
 */
export function buildMockRdpFile(host: string, username: string | undefined, o: RdpFileOptions = {}): string {
  const on = (v: boolean | undefined, d: boolean) => ((v ?? d) ? 1 : 0);
  const wantDrives = o.drives ?? true;
  const fullAddress = /:\d+$/.test(host) ? host : `${host}:3389`;
  const lines = [
    `full address:s:${fullAddress}`,
    ...(username ? [`username:s:${username}`] : []),
    `use multimon:i:${on(o.multimon, true)}`,
    'screen mode id:i:2',
    'dynamic resolution:i:1',
    'smart sizing:i:1',
    `redirectclipboard:i:${on(o.clipboard, true)}`,
    `drivestoredirect:s:${wantDrives ? '*' : ''}`,
    `devicestoredirect:s:${wantDrives ? '*' : ''}`,
    `redirectprinters:i:${on(o.printers, true)}`,
    'audiomode:i:0',
    'networkautodetect:i:1',
    'gatewayusagemethod:i:0',
    'promptcredentialonce:i:1',
    'authentication level:i:0',
  ];
  return `${lines.join('\r\n')}\r\n`;
}
