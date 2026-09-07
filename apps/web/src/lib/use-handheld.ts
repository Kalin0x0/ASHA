'use client';

import { useEffect, useState } from 'react';

/**
 * True on a phone-sized, touch-driven screen.
 *
 * Deliberately narrower than "is touch": a touchscreen laptop or a large tablet
 * still has room for the full desktop shells, so only genuinely small devices
 * match. Resolves after mount, so the first client paint still agrees with the
 * server-rendered markup.
 */
const QUERY = '(max-width: 767px), (pointer: coarse) and (max-width: 1024px)';

export function useIsHandheld(): boolean {
  const [handheld, setHandheld] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const apply = () => setHandheld(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  return handheld;
}
