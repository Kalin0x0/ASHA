'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** The portal desktop experience the user has picked. */
export type ShellMode = 'windows' | 'macos' | 'classic';

export const SHELL_MODES: ShellMode[] = ['windows', 'macos', 'classic'];

export const DEFAULT_SHELL_MODE: ShellMode = 'windows';

interface ShellState {
  mode: ShellMode;
  setMode: (mode: ShellMode) => void;
}

/**
 * Per-browser desktop-style preference for the end-user portal: a Windows-style
 * taskbar desktop, a macOS-style dock desktop, or the classic launcher grid.
 * Persisted to localStorage (a UI preference, not server state) — same pattern
 * as the wallpaper (background-store) and favorites stores.
 */
export const useShell = create<ShellState>()(
  persist(
    (set) => ({
      mode: DEFAULT_SHELL_MODE,
      setMode: (mode) => set({ mode }),
    }),
    { name: 'asha-shell' },
  ),
);
