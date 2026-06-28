'use client';

import { useEffect, useState } from 'react';
import { backgroundById, DEFAULT_BACKGROUND_ID } from '@/lib/backgrounds';
import { useBackground } from '@/lib/background-store';

/**
 * App-wide wallpaper — a fixed, full-viewport layer behind ALL content (portal
 * and admin). Reads the user's chosen preset (or custom image) from the
 * background store. Sits at z-0; chrome and opaque cards float above it (they
 * carry `relative z-10`). Photo wallpapers get a theme-aware scrim, bloom
 * presets a theme-aware vignette, so text stays readable in either theme.
 */
export function AppBackground() {
  const presetId = useBackground((s) => s.presetId);
  const customImageUrl = useBackground((s) => s.customImageUrl);

  // The store rehydrates from localStorage on the client; render the default on
  // the server / first paint to avoid a hydration mismatch, then switch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const preset = backgroundById(mounted ? presetId : DEFAULT_BACKGROUND_ID);
  const custom = mounted ? customImageUrl : null;
  // A photo wallpaper: an explicit custom URL wins, else the preset's bundled src.
  const photoSrc = custom ?? preset.src ?? null;

  return (
    <div className="fixed inset-0 z-0 overflow-hidden bg-background" aria-hidden>
      {photoSrc ? (
        <>
          <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url('${photoSrc}')` }} />
          <div className="wallpaper-scrim absolute inset-0" />
        </>
      ) : (
        <>
          <div className="bg-wallpaper absolute inset-0" style={{ backgroundImage: preset.image }} />
          {preset.grid && <div className="absolute inset-0 bg-grid opacity-50" />}
          <div className="wallpaper-vignette absolute inset-0" />
        </>
      )}
    </div>
  );
}
