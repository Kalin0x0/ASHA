'use client';

import { create } from 'zustand';

/** What the launch overlay shows while a session opens. */
export interface LaunchOverlayPayload {
  name: string;
  iconUrl?: string;
  dockerImage?: string;
  category?: string;
}

interface LaunchOverlayState {
  payload: LaunchOverlayPayload | null;
  /** Deferred navigation, fired mid-animation by the overlay component. */
  navigate: (() => void) | null;
  /** Whether a <LaunchOverlay/> is mounted and able to play the animation. */
  mounted: boolean;
  setMounted: (mounted: boolean) => void;
  show: (payload: LaunchOverlayPayload, navigate: () => void) => void;
  clear: () => void;
}

export const useLaunchOverlay = create<LaunchOverlayState>()((set) => ({
  payload: null,
  navigate: null,
  mounted: false,
  setMounted: (mounted) => set({ mounted }),
  show: (payload, navigate) => set({ payload, navigate }),
  clear: () => set({ payload: null, navigate: null }),
}));

/**
 * Open a session with the "opening" animation: a frosted overlay with the app
 * icon zooming in and a gold pulse, then the navigation fires mid-animation.
 *
 * Degrades safely: with no overlay mounted (e.g. a surface that doesn't render
 * one), with reduced motion, or while another launch is already animating, it
 * just navigates immediately — the animation is never load-bearing.
 */
export function launchTransition(payload: LaunchOverlayPayload, navigate: () => void) {
  const s = useLaunchOverlay.getState();
  const reduced =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!s.mounted || reduced || s.payload) {
    navigate();
    return;
  }
  s.show(payload, navigate);
}
