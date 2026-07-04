'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, Search, Star } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AppIcon } from '@/components/composite/app-icon';
import { LiquidGlass } from '@/components/ui/liquid-glass';
import { useFavorites } from '@/lib/favorites-store';
import type { Workspace } from '@/lib/types';
import { cn } from '@/lib/utils';

/**
 * The Launchpad — a macOS-style full-screen frosted overlay listing every
 * launchable workspace as a big icon. Opens from the dock or ⌘K; closes on
 * Escape or a click on the backdrop.
 */
export function Launchpad({
  open,
  onClose,
  workspaces,
  launchingId,
  onLaunch,
}: {
  open: boolean;
  onClose: () => void;
  workspaces: Workspace[];
  launchingId: string | null;
  onLaunch: (id: string) => void;
}) {
  const t = useTranslations('portal');
  const tc = useTranslations('common');
  const favorites = useFavorites();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset filters + focus the search each time the Launchpad opens.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setCategory(null);
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  // Escape closes (the search field handles its own Escape-to-clear first).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const enabled = useMemo(
    () => workspaces.filter((w) => w.enabled).sort((a, b) => a.friendlyName.localeCompare(b.friendlyName)),
    [workspaces],
  );

  const categories = useMemo(() => {
    const set = new Set(enabled.map((w) => w.category));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [enabled]);

  const filtered = useMemo(
    () =>
      enabled.filter(
        (w) =>
          (!category || w.category === category) &&
          (!query ||
            w.friendlyName.toLowerCase().includes(query.toLowerCase()) ||
            w.category.toLowerCase().includes(query.toLowerCase()) ||
            w.description.toLowerCase().includes(query.toLowerCase())),
      ),
    [enabled, category, query],
  );

  const onToggleFavorite = (ws: Workspace) => {
    const wasFav = favorites.isFavorite(ws.id);
    favorites.toggle(ws.id);
    toast.success(
      wasFav
        ? t('favorites.removedToast', { name: ws.friendlyName })
        : t('favorites.addedToast', { name: ws.friendlyName }),
    );
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={t('desktop.launchpad.label')}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-40 overflow-y-auto bg-background/70 backdrop-blur-2xl backdrop-saturate-150"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 1.04, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 1.04, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="mx-auto flex min-h-full max-w-5xl flex-col px-6 pb-32 pt-10"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Search pill — a liquid-glass field */}
            <div className="relative mx-auto w-full max-w-sm rounded-full transition-shadow duration-200 focus-within:shadow-[var(--gold-glow)]">
              <LiquidGlass radius="rounded-full" sheen={false} className="border border-white/12">
                <div className="relative flex items-center">
                  <Search
                    className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden
                  />
                  <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                      // First Escape clears an active query; the window handler
                      // then closes the Launchpad on the next press.
                      if (e.key === 'Escape' && query) {
                        e.stopPropagation();
                        setQuery('');
                      }
                    }}
                    placeholder={t('launcher.searchPlaceholder')}
                    aria-label={t('launcher.searchPlaceholder')}
                    className="h-10 w-full bg-transparent ps-10 pe-4 text-sm outline-none placeholder:text-muted-foreground"
                  />
                </div>
              </LiquidGlass>
            </div>

            {/* Category pills */}
            <div className="mx-auto mt-5 flex max-w-3xl flex-wrap items-center justify-center gap-2">
              <LaunchpadPill label={tc('labels.all')} active={category === null} onClick={() => setCategory(null)} />
              {categories.map((c) => (
                <LaunchpadPill key={c} label={c} active={category === c} onClick={() => setCategory(c)} />
              ))}
            </div>

            {/* Icon grid */}
            {filtered.length === 0 ? (
              <p className="mt-20 text-center text-sm text-muted-foreground">{t('launcher.noResults')}</p>
            ) : (
              <div className="mt-10 grid grid-cols-3 gap-x-4 gap-y-9 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
                {filtered.map((ws, i) => (
                  <motion.div
                    key={ws.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i * 0.02, 0.3), duration: 0.25 }}
                    className="group relative flex flex-col items-center gap-2.5"
                  >
                    <button
                      type="button"
                      onClick={() => onLaunch(ws.id)}
                      disabled={launchingId !== null}
                      aria-label={t('card.launchAria', { name: ws.friendlyName })}
                      className="relative rounded-[1.4rem] outline-none transition-transform duration-200 ring-gold-focus hover:scale-105 active:scale-95 disabled:pointer-events-none"
                    >
                      <AppIcon
                        name={ws.friendlyName}
                        dockerImage={ws.dockerImage}
                        category={ws.category}
                        iconUrl={ws.iconUrl}
                        rounded="rounded-[1.4rem]"
                        className={cn('size-16 sm:size-[4.5rem]', launchingId === ws.id && 'opacity-60')}
                      />
                      {launchingId === ws.id && (
                        <span className="absolute inset-0 flex items-center justify-center">
                          <Loader2 className="size-6 animate-spin text-anthracite-900" aria-hidden />
                        </span>
                      )}
                    </button>

                    {/* Favorite toggle — appears on hover, top-end of the icon */}
                    <button
                      type="button"
                      onClick={() => onToggleFavorite(ws)}
                      aria-label={
                        favorites.isFavorite(ws.id) ? t('card.removeFavorite') : t('card.addFavorite')
                      }
                      className={cn(
                        'absolute -top-2 end-1/2 z-10 flex size-6 translate-x-[2.4rem] items-center justify-center rounded-full border border-border-subtle glass-strong opacity-0 shadow-sm transition-opacity focus-visible:opacity-100 group-hover:opacity-100 ring-gold-focus rtl:-translate-x-[2.4rem]',
                        favorites.isFavorite(ws.id) && 'opacity-100',
                      )}
                    >
                      <Star
                        className={cn(
                          'size-3',
                          favorites.isFavorite(ws.id) ? 'fill-gold-400 text-gold-300' : 'text-muted-foreground',
                        )}
                        aria-hidden
                      />
                    </button>

                    <span className="w-full truncate text-center text-xs font-medium text-foreground/90">
                      {ws.friendlyName}
                    </span>
                    <span className="-mt-1.5 text-[10px] tabular-nums text-muted-foreground">
                      {t('desktop.launchpad.specs', { cores: ws.cores, gb: (ws.memMb / 1024).toFixed(1) })}
                    </span>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function LaunchpadPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wider transition-colors ring-gold-focus',
        active
          ? 'border-gold-500/30 bg-gold-500/15 text-gold-300'
          : 'border-transparent text-muted-foreground hover:text-foreground',
      )}
    >
      {label}
    </button>
  );
}
