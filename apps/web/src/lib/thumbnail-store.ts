'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ThumbEntry {
  /** SVG/PNG data URL of the last-session screenshot. */
  dataUrl: string;
  /** ISO timestamp of when the thumbnail was captured. */
  capturedAt: string;
}

interface ThumbnailState {
  thumbs: Record<string, ThumbEntry>;
  setThumb: (workspaceId: string, entry: ThumbEntry) => void;
  clearThumb: (workspaceId: string) => void;
}

/**
 * Per-browser thumbnail cache. Maps workspaceId → last-session screenshot.
 * Persisted to localStorage so the preview survives reloads.
 * In mock mode it is pre-seeded with SVG placeholders; in live mode the
 * streaming viewer captures a real screenshot when the session terminates.
 */
export const useThumbnails = create<ThumbnailState>()(
  persist(
    (set) => ({
      thumbs: {},
      setThumb: (workspaceId, entry) =>
        set((s) => ({ thumbs: { ...s.thumbs, [workspaceId]: entry } })),
      clearThumb: (workspaceId) =>
        set((s) => {
          const next = { ...s.thumbs };
          delete next[workspaceId];
          return { thumbs: next };
        }),
    }),
    { name: 'asha-workspace-thumbs' },
  ),
);
