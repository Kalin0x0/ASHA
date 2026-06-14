'use client';

import { Download } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { usePwa } from '@/lib/pwa/pwa-context';

/**
 * "Install app" button — appears only when the browser offers an install prompt
 * and the app isn't already installed (so it's invisible inside the installed
 * standalone window, and on browsers without PWA install support).
 */
export function InstallButton({ className }: { className?: string }) {
  const t = useTranslations('pwa');
  const { canInstall, promptInstall } = usePwa();
  if (!canInstall) return null;
  return (
    <Button variant="secondary" size="sm" className={className} onClick={() => void promptInstall()} title={t('installHint')}>
      <Download className="size-4" /> {t('install')}
    </Button>
  );
}
