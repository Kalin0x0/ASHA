'use client';

import { useLocale } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';

/**
 * Tiled, identity-bearing watermark overlay for the live streaming surface.
 *
 * This is a client-side screenshot / shoulder-surfing / photo-of-screen
 * deterrent: it stamps the *viewer's own identity* and a live timestamp across
 * the stream so any captured frame is attributable to the person who took it.
 * It complements — and does not replace — the server-side DLP watermark the
 * KasmVNC/Neko image can burn into the pixel stream (driven by the workspace
 * `dlp.watermark` policy); this overlay is always-on and needs no backend.
 *
 * It is rendered `pointer-events-none` so it never intercepts input destined
 * for the embedded session, and it sits above the stream frame but below the
 * interactive overlays (paused / drag-drop / webcam).
 */
export function SessionWatermark({
  identity,
  sessionId,
  opacity = 0.13,
  className,
}: {
  /** Human label for the viewer, e.g. "Shahin Naiemi · shahin@asha.local". */
  identity: string;
  /** Session id — a short slice is shown for forensic correlation. */
  sessionId?: string;
  /** Text alpha (0–1). Admin DLP policy may tune this; default is subtle. */
  opacity?: number;
  className?: string;
}) {
  const locale = useLocale();
  // Refresh the stamped timestamp periodically so a photo of the screen carries
  // a near-current time without burning CPU on a per-second redraw.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(i);
  }, []);

  const label = useMemo(() => {
    const stamp = new Date(now).toLocaleString(locale, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    const sid = sessionId ? ` · ${sessionId.slice(0, 8)}` : '';
    return `${identity} · ${stamp}${sid}`;
  }, [identity, locale, now, sessionId]);

  // A single repeating SVG tile draws the label rotated ~-30°; the browser
  // tiles it across the whole surface via background-repeat. encodeURIComponent
  // keeps multi-byte names (e.g. accents) valid inside the data URI.
  const backgroundImage = useMemo(() => {
    const alpha = Math.min(0.4, Math.max(0.03, opacity));
    // A dark outline behind the white fill keeps the stamp legible on BOTH light
    // and dark stream content (a plain white fill vanishes on bright desktops).
    const strokeAlpha = Math.min(0.5, alpha + 0.06);
    // Proper XML text escaping — '&' must become '&amp;' (not a substituted glyph)
    // so the real identity is preserved for forensic attribution. The whole SVG is
    // encodeURIComponent'd below, so the entity round-trips correctly.
    const safe = label.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='420' height='220'>
<text x='50%' y='50%' transform='rotate(-30 210 110)' fill='rgba(255,255,255,${alpha})' stroke='rgba(0,0,0,${strokeAlpha})' stroke-width='0.6' paint-order='stroke' font-family='ui-monospace, SFMono-Regular, Menlo, monospace' font-size='13' font-weight='500' text-anchor='middle' dominant-baseline='middle'>${safe}</text>
</svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  }, [label, opacity]);

  return (
    <div
      aria-hidden
      data-testid="session-watermark"
      className={className}
      style={{
        position: 'absolute',
        // Clear the 3rem (h-12) control bar; sit above the stream frame but
        // below the interactive overlays (paused z-30, drag z-40, webcam z-30).
        top: '3rem',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 15,
        pointerEvents: 'none',
        userSelect: 'none',
        backgroundImage,
        backgroundRepeat: 'repeat',
        backgroundPosition: 'center',
        mixBlendMode: 'screen',
      }}
    />
  );
}
