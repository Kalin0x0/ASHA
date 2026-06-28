'use client';

import { useTranslations } from 'next-intl';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

/** The non-standard install-prompt event (Chromium). */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface PwaContextValue {
  /** A deferred install prompt is available and the app isn't installed yet. */
  canInstall: boolean;
  /** Running as an installed standalone app. */
  installed: boolean;
  /** The browser reports no network connection. */
  offline: boolean;
  /** Show the native install prompt (no-op if unavailable). */
  promptInstall: () => Promise<void>;
}

const FALLBACK: PwaContextValue = {
  canInstall: false,
  installed: false,
  offline: false,
  promptInstall: async () => {},
};

const PwaContext = createContext<PwaContextValue | null>(null);

export function PwaProvider({ children }: { children: React.ReactNode }) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [offline, setOffline] = useState(false);
  // Keep translations fresh without re-running the (run-once) registration effect.
  const t = useTranslations('pwa');
  const tRef = useRef(t);
  tRef.current = t;

  useEffect(() => {
    // Register the service worker (production only — a SW in dev fights HMR) and
    // surface an "update available" toast when a new version is waiting.
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      let reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        // Only reload when the user accepted an update (not on first install).
        if (reloading) window.location.reload();
      });

      const promptUpdate = (worker: ServiceWorker | null) => {
        if (!worker) return;
        toast(tRef.current('updateTitle'), {
          description: tRef.current('updateBody'),
          duration: Infinity,
          action: {
            label: tRef.current('reload'),
            onClick: () => {
              reloading = true;
              worker.postMessage('SKIP_WAITING');
            },
          },
        });
      };

      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          // An update may already be waiting from a previous visit.
          if (registration.waiting && navigator.serviceWorker.controller) promptUpdate(registration.waiting);
          registration.addEventListener('updatefound', () => {
            const installing = registration.installing;
            installing?.addEventListener('statechange', () => {
              // `controller` present ⇒ this is an update, not the first install.
              if (installing.state === 'installed' && navigator.serviceWorker.controller) {
                promptUpdate(registration.waiting ?? installing);
              }
            });
          });
        })
        .catch(() => {});
    }

    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setInstalled(standalone);
    setOffline(!navigator.onLine);

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    const onOnline = () => setOffline(false);
    const onOffline = () => setOffline(true);

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferred) return;
    await deferred.prompt();
    try {
      await deferred.userChoice;
    } finally {
      setDeferred(null);
    }
  }, [deferred]);

  return (
    <PwaContext.Provider value={{ canInstall: Boolean(deferred) && !installed, installed, offline, promptInstall }}>
      {children}
    </PwaContext.Provider>
  );
}

export function usePwa(): PwaContextValue {
  return useContext(PwaContext) ?? FALLBACK;
}
