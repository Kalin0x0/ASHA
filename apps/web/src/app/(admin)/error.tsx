'use client';

import { AlertTriangle, RotateCcw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { reportClientError } from '@/lib/error-report';

/**
 * Admin-segment error boundary. A render/runtime crash inside the dashboard is
 * captured automatically (error code + stack) and a branded, retryable fallback
 * is shown instead of a blank screen.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('support.errorBoundary');

  useEffect(() => {
    reportClientError({
      errorName: error.name || 'Error',
      message: error.message || 'Render error',
      stack: error.stack,
      component: 'web',
      severity: 'HIGH',
    });
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card elevation={1} className="max-w-md space-y-5 p-8 text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl border border-[rgba(210,104,95,0.3)] bg-[rgba(210,104,95,0.1)]">
          <AlertTriangle className="size-7 text-destructive" />
        </div>
        <div className="space-y-1.5">
          <h1 className="font-display text-xl font-medium">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('description')}</p>
        </div>
        {error.digest && (
          <p className="font-mono text-xs text-muted-foreground/70">
            {t('reference')}: {error.digest}
          </p>
        )}
        <div className="flex justify-center gap-3 pt-1">
          <Button onClick={reset}>
            <RotateCcw className="size-4" /> {t('retry')}
          </Button>
        </div>
      </Card>
    </div>
  );
}
