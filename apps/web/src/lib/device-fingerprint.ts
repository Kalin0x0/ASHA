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

/**
 * FNV-1a, seeded. One pass gives 32 bits — far too narrow here: the composed
 * inputs are fleet-identical on standardised corporate hardware (same browser
 * build, same 1920x1080, same locale and timezone), so a 32-bit digest made
 * genuine collisions likely. Since a collision means a colleague is refused a
 * demo they never used — with no admin UI to clear the grant — the width
 * matters. Four independent seeds give 128 bits.
 */
function fnv1a(str: string, seed: number): number {
  let h = seed;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    // 32-bit FNV prime (16777619) via shifts, staying inside int32 math.
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

/** 128-bit digest as 32 lowercase hex characters. */
function wideHash(str: string): string {
  const seeds = [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b];
  return seeds.map((seed) => fnv1a(str, seed).toString(16).padStart(8, '0')).join('');
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
  return wideHash(parts.join('|'));
}
