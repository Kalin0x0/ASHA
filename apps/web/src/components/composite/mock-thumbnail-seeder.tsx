'use client';

import { useEffect } from 'react';
import { MOCK_THUMBNAILS } from '@/lib/mock/thumbnails';
import { useThumbnails } from '@/lib/thumbnail-store';
import { isLive } from '@/lib/api/mode';

/**
 * Invisible component mounted once in the portal layout. In mock mode it
 * seeds the thumbnail store with pre-built SVG workspace previews so the
 * "last connection" thumbnails are visible on first load without a real backend.
 * In live mode it is a no-op — the streaming viewer writes real thumbnails.
 */
export function MockThumbnailSeeder() {
  const { thumbs, setThumb } = useThumbnails();

  useEffect(() => {
    if (isLive) return;
    for (const [workspaceId, entry] of Object.entries(MOCK_THUMBNAILS)) {
      // Only seed if there's no real thumbnail already stored.
      if (!thumbs[workspaceId]) {
        setThumb(workspaceId, entry);
      }
    }
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
