'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/api/auth-context';
import { isLive } from '@/lib/api/mode';

/**
 * Protects authenticated areas in live mode: unauthenticated visitors are
 * redirected to /login. In mock mode it is a transparent pass-through (any
 * credentials are accepted, so every route is "logged in"). Rendering null
 * until mounted avoids an SSR/auth hydration flash.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (isLive && mounted && !isAuthenticated) router.replace('/login');
  }, [mounted, isAuthenticated, router]);

  if (!isLive) return <>{children}</>;
  if (!mounted || !isAuthenticated) return null;
  return <>{children}</>;
}
