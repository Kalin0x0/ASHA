'use client';

import { flushSync } from 'react-dom';

/** Minimal typing for the View Transitions API (not yet in every TS lib). */
type DocWithVT = Document & {
  startViewTransition?: (updateCallback: () => void) => { ready: Promise<void> };
};

/**
 * Runs a theme change inside a View Transition so the new theme sweeps across
 * the screen as an expanding circle from the click point (the "theme ripple").
 *
 * Falls back to an instant switch when the View Transitions API is missing
 * (Firefox/Safari today) or the user prefers reduced motion — the CSS in
 * globals.css only animates `::view-transition-new(root)`, so no API support
 * simply means no animation, never a broken switch.
 */
export function themeTransition(apply: () => void, ev?: { clientX: number; clientY: number }) {
  if (typeof document === 'undefined') {
    apply();
    return;
  }
  const doc = document as DocWithVT;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!doc.startViewTransition || reduced) {
    apply();
    return;
  }

  // Circle center = the click; radius = distance to the farthest viewport corner.
  const x = ev?.clientX ?? window.innerWidth / 2;
  const y = ev?.clientY ?? 0;
  const r = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  const root = document.documentElement;
  root.style.setProperty('--theme-reveal-x', `${x}px`);
  root.style.setProperty('--theme-reveal-y', `${y}px`);
  root.style.setProperty('--theme-reveal-r', `${r}px`);

  // flushSync so next-themes' class flip is committed before the API captures
  // the "new" snapshot — otherwise the reveal would show the OLD theme.
  doc.startViewTransition(() => {
    flushSync(apply);
  });
}
