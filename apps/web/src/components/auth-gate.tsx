'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/api/auth-context';
import { isLive } from '@/lib/api/mode';

/**
 * Protects authenticated areas in live mode. In mock mode it is a transparent
 * pass-through (any credentials accepted). Unauthenticated visitors are sent to
 * /login.
 *
 * Critical detail: the auth store hydrates SYNCHRONOUSLY from localStorage on
 * the first read (see auth-store `getAuth()→hydrate()`), so a logged-in user's
 * `isAuthenticated` is already true on the very first client render. We render
 * children immediately for them — previously this gate returned `null` until a
 * post-mount effect flipped a `mounted` flag, which made a soft route-group
 * swap into the portal render NOTHING (no header, no way back) until React
 * committed the next frame: the "hang". The only states that show a neutral
 * loading shell now are genuinely-unknown (pre-mount) and definitely-logged-out
 * (redirect in flight) — never a blank `null`.
 *
 * NOTE: relies on the store hydrating synchronously. If auth ever becomes async,
 * replace the `isAuthenticated` fast-path with an explicit `authReady` flag.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (isLive && mounted && !isAuthenticated) router.replace('/login');
    // `router` intentionally omitted from deps: useRouter() is not referentially
    // stable, and re-running this effect on its identity churn during navigation
    // caused spurious /login redirects. `mounted` + `isAuthenticated` are the
    // only real triggers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, isAuthenticated]);

  if (!isLive) return <>{children}</>;
  // Authenticated → render now. Store hydration is synchronous, so this is
  // correct on the first client frame and is what removes the blank/hang.
  if (isAuthenticated) return <>{children}</>;
  // Unknown (still mounting) or definitely logged out (redirect in flight):
  // a neutral spinner, never a blank null page.
  return <AuthGateFallback />;
}

function AuthGateFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center" role="status" aria-live="polite">
      <span className="size-6 animate-spin rounded-full border-2 border-border-subtle border-t-gold-500" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
