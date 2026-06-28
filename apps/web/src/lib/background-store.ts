'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_BACKGROUND_ID } from '@/lib/backgrounds';

interface BackgroundState {
  /** Active preset id (see lib/backgrounds.ts). Ignored while a custom image is set. */
  presetId: string;
  /** Custom wallpaper image URL — when set, it overrides the preset. */
  customImageUrl: string | null;
  setPreset: (id: string) => void;
  setCustomImage: (url: string | null) => void;
  reset: () => void;
}

/**
 * Per-browser launcher wallpaper choice. Persisted to localStorage so a user's
 * background survives reloads. Backend-agnostic — like favorites, it's a pure
 * UI preference, so it works in both mock and live modes without server state.
 */
export const useBackground = create<BackgroundState>()(
  persist(
    (set) => ({
      presetId: DEFAULT_BACKGROUND_ID,
      customImageUrl: null,
      // Picking a preset clears any custom image so the choice is unambiguous.
      setPreset: (id) => set({ presetId: id, customImageUrl: null }),
      setCustomImage: (url) => set({ customImageUrl: url && url.trim() ? url.trim() : null }),
      reset: () => set({ presetId: DEFAULT_BACKGROUND_ID, customImageUrl: null }),
    }),
    { name: 'asha-portal-background' },
  ),
);
