'use client';

import { CloudOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { usePwa } from '@/lib/pwa/pwa-context';

/**
 * A small fixed badge that appears (bottom-start, clear of the feedback widget)
 * whenever the browser is offline, reassuring the user that cached data is shown.
 */
export function OfflineIndicator() {
  const t = useTranslations('pwa');
  const { offline } = usePwa();
  if (!offline) return null;
  return (
    <div className="fixed bottom-5 start-5 z-40 flex items-center gap-2 rounded-full border border-warning/30 bg-anthracite-900/90 px-3 py-1.5 text-xs font-medium text-warning shadow-[var(--shadow-lifted)] backdrop-blur animate-fade-up">
      <CloudOff className="size-3.5" />
      {t('offlineBadge')}
    </div>
  );
}
