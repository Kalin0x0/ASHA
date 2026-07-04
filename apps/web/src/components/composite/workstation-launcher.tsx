'use client';

import { Search, SearchX, Sparkles, Star } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CategoryRail } from '@/components/composite/category-rail';
import { FavoritesRail } from '@/components/composite/favorites-rail';
import { LaunchDialog } from '@/components/composite/launch-dialog';
import { OpenSessions } from '@/components/composite/my-sessions-strip';
import { WorkspaceCard } from '@/components/composite/workspace-card';
import { Input } from '@/components/ui/input';
import { orderByFavorites, useFavorites } from '@/lib/favorites-store';
import { launchTransition } from '@/lib/launch-overlay-store';
import { useLaunchableWorkspaces, useLaunchSession } from '@/lib/hooks';
import type { Workspace } from '@/lib/types';
import { cn } from '@/lib/utils';

/**
 * The end-user workspace launcher (hero + search + category rail + favorites +
 * catalog grid). Shared between the standalone end-user portal (`/`, no shell
 * chrome) and the admin "Workstation" view (`/workstation`, inside the app
 * shell) so both render exactly the same launcher.
 */
export function WorkstationLauncher() {
  const t = useTranslations('portal');
  const tc = useTranslations('common');
  const router = useRouter();
  const workspaces = useLaunchableWorkspaces();
  const launch = useLaunchSession();
  const favorites = useFavorites();
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [launchingId, setLaunchingId] = useState<string | null>(null);
  // RDP-capable desktops open a chooser ("Web Native" vs "RDP Client") first.
  const [launchTarget, setLaunchTarget] = useState<Workspace | null>(null);

  const enabledAll = useMemo(() => workspaces.filter((w) => w.enabled), [workspaces]);

  // Category list + live counts for the rail and the mobile pills.
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const w of enabledAll) counts.set(w.category, (counts.get(w.category) ?? 0) + 1);
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [enabledAll]);

  // Apply the active category + free-text search.
  const filtered = useMemo(
    () =>
      enabledAll.filter(
        (w) =>
          (!activeCategory || w.category === activeCategory) &&
          (!query ||
            w.friendlyName.toLowerCase().includes(query.toLowerCase()) ||
            w.category.toLowerCase().includes(query.toLowerCase()) ||
            w.description.toLowerCase().includes(query.toLowerCase())),
      ),
    [enabledAll, activeCategory, query],
  );

  // Starred desktops float to the top in the user's chosen (drag-sorted) order.
  const favoriteList = useMemo(
    () => orderByFavorites(filtered, favorites.ids),
    [filtered, favorites.ids],
  );
  const others = useMemo(
    () => filtered.filter((w) => !favorites.ids.includes(w.id)),
    [filtered, favorites.ids],
  );

  // The actual "Web Native" launch: create the session and open the in-browser
  // viewer (RDP/VNC/SSH → /connect, containers → streaming /session).
  const launchWebNative = async (id: string) => {
    setLaunchingId(id);
    const ws = workspaces.find((w) => w.id === id);
    const session = await launch(id);
    if (!session) {
      toast.error(t('launcher.launchError'));
      setLaunchingId(null);
      return;
    }
    setLaunchTarget(null);
    const path = ws && ws.type !== 'CONTAINER' ? `/connect/${session.kasmId}` : `/session/${session.id}`;
    launchTransition(
      {
        name: ws?.friendlyName ?? session.workspaceName,
        iconUrl: ws?.iconUrl,
        dockerImage: ws?.dockerImage,
        category: ws?.category,
      },
      () => router.push(path),
    );
  };

  const onLaunch = (id: string) => {
    const ws = workspaces.find((w) => w.id === id);
    // RDP desktops offer a choice: stream in the browser ("Web Native") or
    // download a `.rdp` for the native client (multi-monitor, clipboard, drives).
    if (ws && ws.type === 'SERVER' && ws.protocol === 'RDP') {
      setLaunchTarget(ws);
      return;
    }
    void launchWebNative(id);
  };

  const onToggleFavorite = (id: string) => {
    const wasFav = favorites.isFavorite(id);
    favorites.toggle(id);
    const ws = workspaces.find((w) => w.id === id);
    const name = ws?.friendlyName ?? t('favorites.workspaceFallback');
    toast.success(
      wasFav ? t('favorites.removedToast', { name }) : t('favorites.addedToast', { name }),
    );
  };

  const renderCard = (ws: (typeof filtered)[number], i: number) => (
    <div key={ws.id} className="animate-fade-up" style={{ animationDelay: `${Math.min(i * 40, 280)}ms` }}>
      <WorkspaceCard
        workspace={ws}
        onLaunch={onLaunch}
        launching={launchingId === ws.id}
        favorite={favorites.ids.includes(ws.id)}
        onToggleFavorite={onToggleFavorite}
      />
    </div>
  );

  return (
    <div>
      {/* ── Hero band ──────────────────────────────────────────────── */}
      {/* Premium-minimal command surface: transparent so the wallpaper shows
          through; one gold bloom + a start-side scrim keep the headline legible
          while the search bar is the prominent hero action. */}
      <div className="gold-hairline relative overflow-hidden border-b border-border-subtle">
        {/* Single restrained gold bloom, anchored top-end, behind everything —
            the one accent. No second hue, no competing orb. */}
        <div
          className="pointer-events-none absolute -end-24 -top-28 size-80 rounded-full bg-gold-500/10 blur-[90px] animate-float"
          aria-hidden
        />
        {/* Legibility scrim — a soft column behind the text only, fading out
            toward the empty side so the wallpaper stays photo-forward there. */}
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-r from-background/70 via-background/30 to-transparent"
          aria-hidden
        />

        <div className="relative mx-auto max-w-[1500px] px-4 pb-6 pt-7 lg:px-8 lg:pt-8">
          {/* Identity + search share one tight baseline: headline on the start,
              the search command surface on the end — search IS the hero action. */}
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between lg:gap-10">
            <div className="animate-fade-up min-w-0">
              <div className="mb-2 inline-flex items-center gap-1.5">
                <Sparkles className="size-3 text-gold-300" aria-hidden />
                <span className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-gold-300">
                  {t('launcher.eyebrow')}
                </span>
              </div>
              <h1 className="font-display text-[1.9rem] font-semibold leading-[1.06] tracking-tight text-balance sm:text-[2.1rem]">
                {t.rich('launcher.title', {
                  gradient: (chunks) => <span className="text-gradient-gold">{chunks}</span>,
                })}
              </h1>
              <p className="mt-1.5 max-w-md text-[13.5px] leading-snug text-muted-foreground">
                {t('launcher.subtitle')}
              </p>
            </div>

            {/* Search — the prominent, beautifully-styled hero action. Glass
                command surface, gold focus glow, a quiet ⌘K affordance. */}
            <div className="animate-fade-up delay-100 relative w-full shrink-0 lg:w-[clamp(20rem,34vw,30rem)]">
              <Search
                className="pointer-events-none absolute start-4 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                placeholder={t('launcher.searchPlaceholder')}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label={t('launcher.searchPlaceholder')}
                className="h-12 rounded-xl border-border-subtle bg-surface-1/60 ps-11 pe-4 text-[15px] backdrop-blur-md shadow-[var(--shadow-ambient)] transition-[box-shadow,border-color] duration-200 hover:border-border focus-visible:border-gold-500/40 focus-visible:shadow-[var(--gold-glow)]"
              />
            </div>
          </div>

          {/* Category pills — mobile / tablet only (the rail handles desktop) */}
          <div className="mt-4 flex flex-wrap gap-2 animate-fade-up delay-200 lg:hidden">
            <CategoryPill label={tc('labels.all')} active={activeCategory === null} onClick={() => setActiveCategory(null)} />
            {categories.map((cat) => (
              <CategoryPill
                key={cat.name}
                label={cat.name}
                active={activeCategory === cat.name}
                onClick={() => setActiveCategory(cat.name)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ── Body: open-sessions rail + category rail + content ─────────── */}
      <div className="mx-auto max-w-[1500px] px-4 py-8 lg:px-8">
        <div className="flex gap-8">
          {/* Kasm-style left rail: the user's OPEN desktops (live preview +
              resume / stop / remove) sit at the top, the category navigator
              below them. */}
          <aside className="hidden w-[300px] shrink-0 lg:block">
            <div className="sticky top-[calc(var(--spacing-topbar)+1.5rem)] flex max-h-[calc(100vh-var(--spacing-topbar)-3rem)] flex-col gap-7 overflow-y-auto pe-1">
              <OpenSessions orientation="vertical" />
              <CategoryRail
                categories={categories}
                total={enabledAll.length}
                active={activeCategory}
                onSelect={setActiveCategory}
              />
            </div>
          </aside>

          <div className="min-w-0 flex-1 space-y-10">
            {/* Narrow viewports have no left rail → open sessions as a top strip. */}
            <OpenSessions orientation="horizontal" className="lg:hidden" />

            {filtered.length === 0 ? (
              <div className="flex flex-col items-center gap-4 py-24 text-center animate-fade-up">
                <span className="flex size-14 items-center justify-center rounded-2xl border border-border-subtle bg-[var(--surface-1)] text-muted-foreground">
                  <SearchX className="size-6" aria-hidden />
                </span>
                <p className="text-muted-foreground">{t('launcher.noResults')}</p>
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    setActiveCategory(null);
                  }}
                  className="text-sm font-medium text-gold-300 hover:text-gold-200 ring-gold-focus rounded-md"
                >
                  {t('launcher.clearFilters')}
                </button>
              </div>
            ) : (
              <>
                {/* Favorites shelf — drag the grip to reorder; order persists */}
                {favoriteList.length > 0 && (
                  <section>
                    <div className="mb-4 flex items-center gap-2">
                      <Star className="size-[18px] fill-gold-400 text-gold-300" />
                      <h2 className="font-display text-xl font-semibold tracking-tight">{t('favorites.title')}</h2>
                      <span className="text-xs text-muted-foreground">({favoriteList.length})</span>
                      {favoriteList.length > 1 && (
                        <span className="ml-1 hidden text-[11px] text-muted-foreground/50 sm:inline">
                          · {t('favorites.reorderHint')}
                        </span>
                      )}
                    </div>
                    <FavoritesRail
                      items={favoriteList}
                      onLaunch={onLaunch}
                      launchingId={launchingId}
                      onToggleFavorite={onToggleFavorite}
                    />
                  </section>
                )}

                {/* Catalog grid */}
                {others.length > 0 && (
                  <section>
                    {favoriteList.length > 0 && (
                      <h2 className="mb-4 font-display text-xl font-semibold tracking-tight">
                        {activeCategory ?? t('launcher.allWorkspacesHeading')}
                      </h2>
                    )}
                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                      {others.map(renderCard)}
                    </div>
                  </section>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <LaunchDialog
        workspace={launchTarget}
        open={launchTarget !== null}
        onOpenChange={(o) => !o && setLaunchTarget(null)}
        onWebNative={(ws) => void launchWebNative(ws.id)}
        launching={launchingId !== null}
      />
    </div>
  );
}

function CategoryPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wider transition-colors ring-gold-focus',
        active
          ? 'bg-gold-500/15 text-gold-300 ring-1 ring-gold-500/30'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {label}
    </button>
  );
}
