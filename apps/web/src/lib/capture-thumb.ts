'use client';

/**
 * Capture a small JPEG thumbnail of the largest <canvas> inside `root` — used to
 * snapshot a live remote-desktop (guacd canvas) so the "My Sessions" switcher can
 * show a real preview of what the desktop looks like. Best-effort: returns null
 * if there's nothing to capture or the canvas can't be read.
 */
export function captureCanvasThumb(root: HTMLElement | null, maxW = 420): string | null {
  if (!root || typeof document === 'undefined') return null;
  try {
    const canvases = Array.from(root.querySelectorAll('canvas'));
    if (canvases.length === 0) return null;
    // The desktop image lives on the largest layer (cursor/overlays are smaller).
    const src = canvases.reduce((a, b) => (a.width * a.height >= b.width * b.height ? a : b));
    if (!src.width || !src.height) return null;
    const scale = Math.min(1, maxW / src.width);
    const w = Math.max(1, Math.round(src.width * scale));
    const h = Math.max(1, Math.round(src.height * scale));
    const off = document.createElement('canvas');
    off.width = w;
    off.height = h;
    const ctx = off.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(src, 0, 0, w, h);
    return off.toDataURL('image/jpeg', 0.5);
  } catch {
    return null;
  }
}
