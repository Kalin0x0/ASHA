'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface FavoritesState {
  /** Ordered list of favorited workspace IDs (order is user-controlled). */
  ids: string[];
  isFavorite: (id: string) => boolean;
  toggle: (id: string) => void;
  add: (id: string) => void;
  remove: (id: string) => void;
  /** Replace the favorite order — used by drag-to-reorder. */
  reorder: (ids: string[]) => void;
}

/**
 * Per-browser workspace favorites. Persisted to localStorage so a user's
 * starred desktops survive reloads. Backend-agnostic — works in both mock
 * and live modes (favorites are a UI preference, not server state).
 */
export const useFavorites = create<FavoritesState>()(
  persist(
    (set, get) => ({
      ids: [],
      isFavorite: (id) => get().ids.includes(id),
      toggle: (id) =>
        set((s) => ({
          ids: s.ids.includes(id) ? s.ids.filter((x) => x !== id) : [...s.ids, id],
        })),
      add: (id) => set((s) => (s.ids.includes(id) ? s : { ids: [...s.ids, id] })),
      remove: (id) => set((s) => ({ ids: s.ids.filter((x) => x !== id) })),
      reorder: (ids) => set({ ids }),
    }),
    { name: 'asha-favorites' },
  ),
);

/** Resolve favorite IDs to items, preserving the stored (user) order. */
export function orderByFavorites<T extends { id: string }>(items: T[], ids: string[]): T[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  return ids.map((id) => byId.get(id)).filter((x): x is T => Boolean(x));
}
