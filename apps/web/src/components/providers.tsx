'use client';

import { DirectionProvider } from '@radix-ui/react-direction';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { useEffect, useState } from 'react';
import { useLocale } from 'next-intl';
import { Toaster } from 'sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { localeDir } from '@/i18n/locales';
import { AuthProvider } from '@/lib/api/auth-context';
import { isLive } from '@/lib/api/mode';
import { store } from '@/lib/mock/store';

export function Providers({ children }: { children: React.ReactNode }) {
  const locale = useLocale();
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 },
        },
      }),
  );

  // Start the mock telemetry ticker (the "breathing" dashboard). Live mode is
  // driven by the API + react-query refetching, so the ticker stays off there.
  useEffect(() => {
    if (isLive) return;
    store.startTicker();
    return () => store.stopTicker();
  }, []);

  return (
    <DirectionProvider dir={localeDir(locale)}>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <TooltipProvider delayDuration={200} skipDelayDuration={300}>
              {children}
              <Toaster
                position="bottom-right"
                theme="dark"
                toastOptions={{
                  classNames: {
                    toast: 'glass-strong !rounded-lg !border-border-subtle',
                    title: '!text-foreground !font-medium',
                    description: '!text-muted-foreground',
                  },
                }}
              />
            </TooltipProvider>
          </AuthProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </DirectionProvider>
  );
}
