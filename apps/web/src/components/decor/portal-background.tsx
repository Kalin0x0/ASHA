'use client';

import { useEffect, useState } from 'react';
import { backgroundById, DEFAULT_BACKGROUND_ID } from '@/lib/backgrounds';
import { useBackground } from '@/lib/background-store';
import { cn } from '@/lib/utils';

/**
 * The launcher wallpaper — a fixed, full-viewport layer behind all portal
 * content. Reads the user's chosen preset (or custom image) from the background
 * store and renders it with the signature aurora drift. Sits at z-0 so the
 * glass topbar and opaque workspace cards float above it, while the global
 * grain overlay (z-60) still reads on top.
 */
export function PortalBackground() {
  const presetId = useBackground((s) => s.presetId);
  const customImageUrl = useBackground((s) => s.customImageUrl);

  // The store rehydrates from localStorage on the client; render the default on
  // the server / first paint to avoid a hydration mismatch, then switch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const preset = backgroundById(mounted ? presetId : DEFAULT_BACKGROUND_ID);
  const custom = mounted ? customImageUrl : null;

  return (
    <div className="fixed inset-0 z-0 overflow-hidden bg-anthracite-950" aria-hidden>
      {custom ? (
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url('${custom}')` }}
        />
      ) : (
        <div className="bg-wallpaper absolute inset-0" style={{ backgroundImage: preset.image }} />
      )}

      {!custom && preset.grid && <div className="absolute inset-0 bg-grid opacity-50" />}

      {/* Legibility scrim — keeps the glass chrome and headings readable over any
          wallpaper. A heavier blanket for custom photos, a soft vignette for the
          curated presets so their blooms still glow. */}
      <div
        className={cn(
          'absolute inset-0',
          custom
            ? 'bg-[linear-gradient(to_bottom,rgba(14,14,26,0.72),rgba(14,14,26,0.5)_42%,rgba(14,14,26,0.8))]'
            : 'bg-[radial-gradient(120%_120%_at_50%_0%,transparent_38%,rgba(14,14,26,0.72)_100%)]',
        )}
      />
    </div>
  );
}
