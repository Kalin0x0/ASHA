'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface IconPos {
  x: number;
  y: number;
}

interface DesktopLayoutState {
  /** Absolute desktop position (px from the top-left) per workspace id. */
  positions: Record<string, IconPos>;
  setPosition: (id: string, pos: IconPos) => void;
  clear: (id: string) => void;
  /** Forget all custom placements → icons fall back to the auto grid. */
  reset: () => void;
}

/**
 * Where the user has dragged each desktop icon (Windows shell). Persisted per
 * browser — a pure UI preference, like favorites and the wallpaper. Icons with
 * no stored position fall back to an auto column grid, so newly-pinned
 * workspaces still appear before they're ever moved.
 */
export const useDesktopLayout = create<DesktopLayoutState>()(
  persist(
    (set) => ({
      positions: {},
      setPosition: (id, pos) => set((s) => ({ positions: { ...s.positions, [id]: pos } })),
      clear: (id) =>
        set((s) => {
          const next = { ...s.positions };
          delete next[id];
          return { positions: next };
        }),
      reset: () => set({ positions: {} }),
    }),
    { name: 'asha-desktop-layout' },
  ),
);
