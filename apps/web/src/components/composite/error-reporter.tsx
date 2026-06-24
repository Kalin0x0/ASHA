'use client';

import { useEffect } from 'react';
import { reportClientError } from '@/lib/error-report';

/**
 * Mounts the global `error` + `unhandledrejection` listeners so unexpected
 * runtime failures anywhere in the app are captured automatically (with an
 * error code + stack) and sent to the central intake. Renders nothing.
 */
export function ErrorReporter() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      reportClientError({
        errorName: e.error?.name ?? 'Error',
        message: e.message || e.error?.message || 'Unknown error',
        stack: e.error?.stack,
        severity: 'HIGH',
      });
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason as { name?: string; message?: string; stack?: string } | string | undefined;
      reportClientError({
        errorName: typeof r === 'object' ? (r?.name ?? 'UnhandledRejection') : 'UnhandledRejection',
        message:
          typeof r === 'string' ? r : (r?.message ?? 'Unhandled promise rejection'),
        stack: typeof r === 'object' ? r?.stack : undefined,
        severity: 'HIGH',
      });
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);
  return null;
}
