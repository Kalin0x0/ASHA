'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Radix locks the page for an open modal with `body { pointer-events: none }`
 * and restores it when the modal closes — but a modal that UNMOUNTS on a
 * navigation instead of closing (the launch dialog routing straight into a
 * viewer, for one) never gets the chance, so the lock is left behind on <body>
 * and, since `pointer-events` inherits, freezes every page that follows: an
 * invisible dialog that "froze the entire viewer, Back included" (see
 * lib/z-layers.test). A route change means any modal that set the lock has
 * already unmounted, so clearing a lingering one here is always safe and undoes
 * the freeze app-wide — the viewer roots also force it back on themselves as a
 * second line of defence.
 */
export function BodyLockGuard() {
  const pathname = usePathname();
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (document.body.style.pointerEvents === 'none') {
      document.body.style.pointerEvents = '';
    }
  }, [pathname]);
  return null;
}
