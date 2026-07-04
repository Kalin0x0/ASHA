'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { LayoutDashboard, Loader2, Power, Search, Star } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AppIcon } from '@/components/composite/app-icon';
import { LiquidGlass } from '@/components/ui/liquid-glass';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useAuth } from '@/lib/api/auth-context';
import { orderByFavorites, useFavorites } from '@/lib/favorites-store';
import { useThumbnails } from '@/lib/thumbnail-store';
import type { SessionRow, Workspace } from '@/lib/types';
import { cn, formatDuration } from '@/lib/utils';

/**
 * The Windows-12-style Start menu: a floating glass panel above the taskbar with
 * a search field, a "Pinned" grid of all workspaces (favorites first, star to
 * pin/unpin), a "Recommended" row of the user's open sessions, and a footer with
 * the signed-in account plus admin / power actions.
 */
export function StartMenu({
  open,
  onClose,
  workspaces,
  sessions,
  launchingId,
  onLaunch,
  onOpenSession,
}: {
  open: boolean;
  onClose: () => void;
  workspaces: Workspace[];
  sessions: SessionRow[];
  launchingId: string | null;
  onLaunch: (id: string) => void;
  onOpenSession: (s: SessionRow) => void;
}) {
  const t = useTranslations('portal');
  const { user, logout } = useAuth();
  const router = useRouter();
  const favorites = useFavorites();
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const pinned = useMemo(() => {
    const enabled = workspaces
      .filter((w) => w.enabled)
      .sort((a, b) => a.friendlyName.localeCompare(b.friendlyName));
    const favs = orderByFavorites(enabled, favorites.ids);
    const rest = enabled.filter((w) => !favorites.ids.includes(w.id));
    return [...favs, ...rest];
  }, [workspaces, favorites.ids]);

  const filtered = useMemo(() => {
    if (!query) return pinned;
    const q = query.toLowerCase();
    return pinned.filter(
      (w) =>
        w.friendlyName.toLowerCase().includes(q) ||
        w.category.toLowerCase().includes(q) ||
        w.description.toLowerCase().includes(q),
    );
  }, [pinned, query]);

  const onTogglePin = (ws: Workspace) => {
    const wasFav = favorites.isFavorite(ws.id);
    favorites.toggle(ws.id);
    toast.success(
      wasFav
        ? t('favorites.removedToast', { name: ws.friendlyName })
        : t('favorites.addedToast', { name: ws.friendlyName }),
    );
  };

  const displayName = user?.displayName || user?.username || user?.email || 'Asha';
  const initials =
    displayName
      .split(/[\s@._-]+/)
      .filter(Boolean)
      .map((w) => w[0]!)
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'A';

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-40"
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={t('desktop.start.title')}
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="absolute bottom-[4.5rem] left-1/2 w-[min(640px,92vw)] -translate-x-1/2"
          >
            <LiquidGlass radius="rounded-2xl" tint="var(--glass-tint-strong)" className="border border-white/12">
              <div className="flex max-h-[min(72vh,640px)] flex-col p-5">
                {/* Search */}
                <div className="relative">
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
                      if (e.key === 'Escape' && query) {
                        e.stopPropagation();
                        setQuery('');
                      }
                    }}
                    placeholder={t('desktop.start.searchPlaceholder')}
                    aria-label={t('desktop.start.searchPlaceholder')}
                    className="h-10 w-full rounded-full border border-white/12 bg-white/8 ps-10 pe-4 text-sm outline-none backdrop-blur-md transition-[box-shadow,border-color] placeholder:text-muted-foreground focus-visible:border-gold-500/40 focus-visible:shadow-[var(--gold-glow)]"
                  />
                </div>

                <div className="mt-4 min-h-0 flex-1 overflow-y-auto pe-1 [scrollbar-width:thin]">
                  {/* Pinned */}
                  <div className="mb-2 flex items-center justify-between">
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {t('desktop.start.pinned')}
                    </h2>
                  </div>
                  {filtered.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">{t('launcher.noResults')}</p>
                  ) : (
                    <div className="grid grid-cols-4 gap-1 sm:grid-cols-6">
                      {filtered.map((ws) => (
                        <StartTile
                          key={ws.id}
                          workspace={ws}
                          launching={launchingId === ws.id}
                          favorite={favorites.ids.includes(ws.id)}
                          onLaunch={() => onLaunch(ws.id)}
                          onTogglePin={() => onTogglePin(ws)}
                        />
                      ))}
                    </div>
                  )}

                  {/* Recommended — the user's open sessions */}
                  {!query && sessions.length > 0 && (
                    <div className="mt-5">
                      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {t('desktop.start.recommended')}
                      </h2>
                      <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                        {sessions.slice(0, 6).map((s) => (
                          <RecommendedItem key={s.id} session={s} workspaces={workspaces} onOpen={() => onOpenSession(s)} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer — account + power */}
                <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Avatar className="size-8">
                      <AvatarFallback className="text-[11px] font-bold">{initials}</AvatarFallback>
                    </Avatar>
                    <span className="truncate text-sm font-medium">{displayName}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {user?.isSystemAdmin && (
                      <button
                        type="button"
                        onClick={() => router.push('/dashboard')}
                        aria-label={t('header.admin')}
                        title={t('header.admin')}
                        className="flex size-9 items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-white/10 hover:text-foreground ring-gold-focus"
                      >
                        <LayoutDashboard className="size-4" aria-hidden />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void logout()}
                      aria-label={t('desktop.start.signOut')}
                      title={t('desktop.start.signOut')}
                      className="flex size-9 items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-destructive/15 hover:text-destructive ring-gold-focus"
                    >
                      <Power className="size-4" aria-hidden />
                    </button>
                  </div>
                </div>
              </div>
            </LiquidGlass>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function StartTile({
  workspace: ws,
  launching,
  favorite,
  onLaunch,
  onTogglePin,
}: {
  workspace: Workspace;
  launching: boolean;
  favorite: boolean;
  onLaunch: () => void;
  onTogglePin: () => void;
}) {
  const t = useTranslations('portal');
  return (
    <div className="group relative flex flex-col items-center gap-1.5 rounded-xl p-2 transition-colors hover:bg-white/8">
      <button
        type="button"
        onClick={onLaunch}
        disabled={launching}
        aria-label={t('card.launchAria', { name: ws.friendlyName })}
        className="relative rounded-2xl outline-none transition-transform duration-150 ring-gold-focus hover:scale-105 active:scale-95 disabled:pointer-events-none"
      >
        <AppIcon
          name={ws.friendlyName}
          dockerImage={ws.dockerImage}
          category={ws.category}
          iconUrl={ws.iconUrl}
          rounded="rounded-2xl"
          className={cn('size-12', launching && 'opacity-60')}
        />
        {launching && (
          <span className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="size-5 animate-spin text-anthracite-900" aria-hidden />
          </span>
        )}
      </button>
      <span className="line-clamp-2 w-full text-center text-[11px] font-medium leading-tight text-foreground/90">
        {ws.friendlyName}
      </span>

      {/* Pin / unpin */}
      <button
        type="button"
        onClick={onTogglePin}
        aria-label={favorite ? t('card.removeFavorite') : t('card.addFavorite')}
        title={favorite ? t('card.removeFavorite') : t('card.addFavorite')}
        className={cn(
          'absolute end-1 top-1 flex size-6 items-center justify-center rounded-full border border-white/12 glass-strong opacity-0 shadow-sm transition-opacity focus-visible:opacity-100 group-hover:opacity-100 ring-gold-focus',
          favorite && 'opacity-100',
        )}
      >
        <Star className={cn('size-3', favorite ? 'fill-gold-400 text-gold-300' : 'text-muted-foreground')} aria-hidden />
      </button>
    </div>
  );
}

function RecommendedItem({
  session: s,
  workspaces,
  onOpen,
}: {
  session: SessionRow;
  workspaces: Workspace[];
  onOpen: () => void;
}) {
  const tc = useTranslations('common');
  const t = useTranslations('portal');
  const thumbs = useThumbnails((st) => st.thumbs);
  const ws = workspaces.find((w) => w.friendlyName === s.workspaceName);
  const thumb = thumbs[s.kasmId] ?? (ws ? thumbs[ws.id] : undefined);
  const running = s.status === 'RUNNING' || s.status === 'DEGRADED';
  const paused = s.status === 'PAUSED';
  const label = running
    ? tc('sessionStatus.RUNNING')
    : paused
      ? tc('sessionStatus.PAUSED')
      : t('mySessions.starting');

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={t('mySessions.resumeAria', { name: s.workspaceName })}
      className="flex items-center gap-3 rounded-xl p-2 text-start outline-none transition-colors hover:bg-white/8 ring-gold-focus"
    >
      <span className="relative size-10 shrink-0 overflow-hidden rounded-lg bg-anthracite-900">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb.dataUrl} alt="" aria-hidden className={cn('size-full object-cover', paused && 'grayscale')} />
        ) : (
          <AppIcon
            name={s.workspaceName}
            dockerImage={ws?.dockerImage}
            category={ws?.category}
            iconUrl={ws?.iconUrl}
            rounded="rounded-lg"
            className="size-full"
          />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium">{s.workspaceName}</span>
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span
            className={cn('size-1.5 rounded-full', running ? 'bg-success' : paused ? 'bg-muted-foreground' : 'bg-warning')}
            aria-hidden
          />
          {label}
          {running && <span className="tabular-nums">· {formatDuration(s.uptimeSec)}</span>}
        </span>
      </span>
    </button>
  );
}
