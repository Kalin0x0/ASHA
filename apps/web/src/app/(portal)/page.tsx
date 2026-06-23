'use client';

import { Search, SearchX, Sparkles, Star } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CategoryRail } from '@/components/composite/category-rail';
import { FavoritesRail } from '@/components/composite/favorites-rail';
import { LaunchDialog } from '@/components/composite/launch-dialog';
import { MySessionsStrip } from '@/components/composite/my-sessions-strip';
import { WorkspaceCard } from '@/components/composite/workspace-card';
import { Input } from '@/components/ui/input';
import { orderByFavorites, useFavorites } from '@/lib/favorites-store';
import { useLaunchSession, useWorkspaces } from '@/lib/hooks';
import type { Workspace } from '@/lib/types';
import { cn } from '@/lib/utils';

export default function PortalHome() {
  const t = useTranslations('portal');
  const tc = useTranslations('common');
  const router = useRouter();
  const workspaces = useWorkspaces();
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
    if (ws && ws.type !== 'CONTAINER') router.push(`/connect/${session.kasmId}`);
    else router.push(`/session/${session.id}`);
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
      {/* Transparent so the app wallpaper (with its theme-aware scrim) shows
          through; the floating orbs add depth without hurting legibility. */}
      <div className="relative overflow-hidden border-b border-border-subtle">
        <div className="pointer-events-none absolute right-[10%] top-[15%] size-64 rounded-full bg-gold-500/8 blur-[80px] animate-float" aria-hidden />
        <div className="pointer-events-none absolute left-[5%] bottom-0 size-48 rounded-full bg-info-500/6 blur-[60px] animate-float delay-300" aria-hidden />

        <div className="relative mx-auto max-w-[1500px] px-4 py-12 lg:px-8">
          <div className="animate-fade-up">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-gold-500/20 bg-gold-500/8 px-3 py-1">
              <Sparkles className="size-3.5 text-gold-300" />
              <span className="text-[11px] font-semibold uppercase tracking-widest text-gold-300">
                {t('launcher.eyebrow')}
              </span>
            </div>
            <h1 className="font-display text-[2.6rem] font-medium leading-[1.04] tracking-tight sm:text-6xl">
              {t.rich('launcher.title', {
                gradient: (chunks) => <span className="text-gradient-gold">{chunks}</span>,
              })}
            </h1>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted-foreground sm:text-base">
              {t('launcher.subtitle')}
            </p>
          </div>

          {/* Search */}
          <div className="relative mt-8 max-w-lg animate-fade-up delay-100">
            <Search className="absolute start-4 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground transition-colors" />
            <Input
              placeholder={t('launcher.searchPlaceholder')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-12 rounded-xl ps-11 pe-4 text-[15px] shadow-[var(--shadow-ambient)] transition-shadow duration-300 focus-visible:shadow-[var(--gold-glow)]"
            />
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

      {/* ── Body: category rail + content ──────────────────────────── */}
      <div className="mx-auto max-w-[1500px] px-4 py-8 lg:px-8">
        <div className="flex gap-8">
          <aside className="hidden w-56 shrink-0 lg:block">
            <div className="sticky top-[calc(var(--spacing-topbar)+1.5rem)]">
              <CategoryRail
                categories={categories}
                total={enabledAll.length}
                active={activeCategory}
                onSelect={setActiveCategory}
              />
            </div>
          </aside>

          <div className="min-w-0 flex-1 space-y-10">
            <MySessionsStrip />

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
