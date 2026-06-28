'use client';

import { RefreshCw, WifiOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Logo } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';

export default function OfflinePage() {
  const t = useTranslations('pwa');

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <Logo />
      <div className="flex size-16 items-center justify-center rounded-2xl border border-border-subtle bg-[var(--surface-2)] text-muted-foreground">
        <WifiOff className="size-7" />
      </div>
      <div className="space-y-2">
        <h1 className="font-display text-2xl font-semibold">{t('offlineTitle')}</h1>
        <p className="max-w-md text-sm text-muted-foreground">{t('offlineBody')}</p>
      </div>
      <Button size="sm" onClick={() => location.reload()}>
        <RefreshCw className="size-4" /> {t('retry')}
      </Button>
    </div>
  );
}
