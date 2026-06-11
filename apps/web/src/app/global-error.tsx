'use client';

import { useEffect } from 'react';
import { reportClientError } from '@/lib/error-report';

/**
 * Last-resort boundary: catches crashes in the root layout itself, so it
 * replaces <html>/<body> and runs OUTSIDE the i18n provider — strings are
 * intentionally plain. The failure is still captured automatically.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportClientError({
      errorName: error.name || 'Error',
      message: error.message || 'Fatal render error',
      stack: error.stack,
      component: 'web',
      severity: 'CRITICAL',
    });
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#14141f',
          color: '#e8e8f0',
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        }}
      >
        <div style={{ maxWidth: 420, padding: 32, textAlign: 'center' }}>
          <div
            style={{
              width: 56,
              height: 56,
              margin: '0 auto 20px',
              borderRadius: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(210,104,95,0.1)',
              border: '1px solid rgba(210,104,95,0.3)',
              fontSize: 28,
            }}
          >
            ⚠
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 500, margin: '0 0 8px' }}>Something went wrong</h1>
          <p style={{ fontSize: 14, color: '#9a9ab8', margin: '0 0 16px' }}>
            An unexpected error occurred and was reported automatically.
          </p>
          {error.digest && (
            <p style={{ fontSize: 12, color: '#6b6b94', fontFamily: 'ui-monospace, monospace' }}>
              Reference: {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            style={{
              marginTop: 20,
              padding: '10px 20px',
              borderRadius: 8,
              border: 'none',
              background: '#d4af37',
              color: '#0e0e1a',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
