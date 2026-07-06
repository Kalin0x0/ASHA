/**
 * Best-effort browser device fingerprint for the 10-minute demo dedup.
 *
 * IMPORTANT — honest limitations: a web page CANNOT read a real hardware ID.
 * This composes stable-ish browser signals (user agent, language, timezone,
 * screen geometry, a canvas/WebGL render hash) into one string. It deters casual
 * repeat demos but is deliberately evadable (incognito, another browser, a VM).
 * The server therefore also dedups by e-mail and records IP + SIEM events; this
 * fingerprint is one signal, not a security boundary.
 */

function canvasHash(): string {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 240;
    canvas.height = 60;
    const ctx = canvas.getContext('2d');
    if (!ctx) return 'no-2d';
    ctx.textBaseline = 'top';
    ctx.font = "16px 'Arial'";
    ctx.fillStyle = '#f60';
    ctx.fillRect(2, 2, 120, 40);
    ctx.fillStyle = '#069';
    ctx.fillText('Asha ✦ demo', 4, 4);
    ctx.fillStyle = 'rgba(102,204,0,0.7)';
    ctx.fillText('Asha ✦ demo', 6, 6);
    return canvas.toDataURL().slice(-96);
  } catch {
    return 'no-canvas';
  }
}

function webglVendor(): string {
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    if (!gl) return 'no-webgl';
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    if (!dbg) return 'no-dbg';
    return `${gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL)}~${gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)}`;
  } catch {
    return 'no-webgl';
  }
}

/** djb2 — small, dependency-free string hash rendered as hex. */
function djb2(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = (h * 33) ^ str.charCodeAt(i);
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Returns a stable-ish fingerprint string for this browser/device. */
export function computeDeviceFingerprint(): string {
  if (typeof window === 'undefined') return 'ssr';
  const nav = window.navigator;
  const parts = [
    nav.userAgent,
    nav.language,
    (nav.languages ?? []).join(','),
    String(nav.hardwareConcurrency ?? ''),
    // @ts-expect-error deviceMemory is non-standard but widely present
    String(nav.deviceMemory ?? ''),
    Intl.DateTimeFormat().resolvedOptions().timeZone ?? '',
    `${window.screen.width}x${window.screen.height}x${window.screen.colorDepth}`,
    String(new Date().getTimezoneOffset()),
    canvasHash(),
    webglVendor(),
  ];
  return djb2(parts.join('|'));
}
