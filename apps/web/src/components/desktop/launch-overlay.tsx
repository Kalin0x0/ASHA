'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { AppIcon } from '@/components/composite/app-icon';
import { useLaunchOverlay } from '@/lib/launch-overlay-store';

/**
 * The session-opening animation: a full-screen frosted overlay with the app
 * icon springing up under a pulsing gold ring, a rising "Opening {name}…"
 * label, and a thin indeterminate progress sweep. Navigation is fired
 * mid-animation (via the store's deferred `navigate`), so the viewer route is
 * already loading behind the overlay when it fades.
 *
 * Mount ONE of these per shell (Windows / macOS / Classic). launchTransition()
 * no-ops to an instant navigate when none is mounted or reduced-motion is on.
 */
export function LaunchOverlay() {
  const t = useTranslations('portal');
  const payload = useLaunchOverlay((s) => s.payload);
  const navigate = useLaunchOverlay((s) => s.navigate);
  const setMounted = useLaunchOverlay((s) => s.setMounted);
  const clear = useLaunchOverlay((s) => s.clear);

  // Register/unregister so launchTransition knows an overlay can play.
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, [setMounted]);

  // Fire the deferred navigation ~380ms in (icon has popped), then clear so the
  // overlay exit-fades over the freshly-loading viewer.
  useEffect(() => {
    if (!payload) return;
    const go = setTimeout(() => navigate?.(), 380);
    const done = setTimeout(() => clear(), 820);
    return () => {
      clearTimeout(go);
      clearTimeout(done);
    };
  }, [payload, navigate, clear]);

  return (
    <AnimatePresence>
      {payload && (
        <motion.div
          role="status"
          aria-live="polite"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.28, ease: 'easeOut' }}
          className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-6 bg-background/60 backdrop-blur-2xl backdrop-saturate-150"
        >
          <div className="relative flex items-center justify-center">
            {/* Expanding gold ring pulse */}
            <motion.span
              aria-hidden
              className="absolute rounded-[2rem] ring-2 ring-gold-500/50"
              initial={{ width: 96, height: 96, opacity: 0.6 }}
              animate={{ width: 200, height: 200, opacity: 0 }}
              transition={{ duration: 1.1, ease: 'easeOut', repeat: Infinity }}
            />
            {/* App icon springing up */}
            <motion.div
              initial={{ scale: 0.4, opacity: 0, y: 12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 18 }}
            >
              <AppIcon
                name={payload.name}
                dockerImage={payload.dockerImage}
                category={payload.category}
                iconUrl={payload.iconUrl}
                rounded="rounded-[1.6rem]"
                className="size-24 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.6)]"
              />
            </motion.div>
          </div>

          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12, duration: 0.3 }}
            className="text-sm font-medium text-foreground/90"
          >
            {t('launchOverlay.opening', { name: payload.name })}
          </motion.p>

          {/* Indeterminate progress sweep */}
          <div className="h-1 w-40 overflow-hidden rounded-full bg-secondary/70">
            <motion.div
              className="h-full w-1/2 rounded-full bg-gold-500"
              initial={{ x: '-120%' }}
              animate={{ x: '240%' }}
              transition={{ duration: 0.9, ease: 'easeInOut', repeat: Infinity }}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
