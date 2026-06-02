'use client';

import { Search, Sparkles, Star } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AuroraBackground } from '@/components/decor/aurora-background';
import { WorkspaceCard } from '@/components/composite/workspace-card';
import { Input } from '@/components/ui/input';
import { useFavorites } from '@/lib/favorites-store';
import { useLaunchSession, useWorkspaces } from '@/lib/hooks';

export default function PortalHome() {
  const router = useRouter();
  const workspaces = useWorkspaces();
  const launch = useLaunchSession();
  const favorites = useFavorites();
  const [query, setQuery] = useState('');
  const [launchingId, setLaunchingId] = useState<string | null>(null);

  const categories = useMemo(
    () => [...new Set(workspaces.filter((w) => w.enabled).map((w) => w.category))],
    [workspaces],
  );

  const enabled = useMemo(
    () =>
      workspaces.filter(
        (w) =>
          w.enabled &&
          (!query ||
            w.friendlyName.toLowerCase().includes(query.toLowerCase()) ||
            w.category.toLowerCase().includes(query.toLowerCase())),
      ),
    [workspaces, query],
  );

  // Split favorites out so a user's starred desktops sit at the top.
  const favoriteList = useMemo(
    () => enabled.filter((w) => favorites.ids.includes(w.id)),
    [enabled, favorites.ids],
  );
  const others = useMemo(
    () => enabled.filter((w) => !favorites.ids.includes(w.id)),
    [enabled, favorites.ids],
  );

  const onLaunch = async (id: string) => {
    setLaunchingId(id);
    const session = await launch(id);
    if (!session) {
      toast.error('Could not start the session');
      setLaunchingId(null);
      return;
    }
    router.push(`/session/${session.id}`);
  };

  const onToggleFavorite = (id: string) => {
    const wasFav = favorites.isFavorite(id);
    favorites.toggle(id);
    const ws = workspaces.find((w) => w.id === id);
    toast.success(
      wasFav
        ? `Removed ${ws?.friendlyName ?? 'workspace'} from favorites`
        : `Added ${ws?.friendlyName ?? 'workspace'} to favorites`,
    );
  };

  const renderCard = (ws: (typeof enabled)[number], i: number) => (
    <div key={ws.id} className="animate-fade-up" style={{ animationDelay: `${Math.min(i * 50, 300)}ms` }}>
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
      {/* Hero */}
      <div className="relative overflow-hidden border-b border-border-subtle">
        <AuroraBackground className="opacity-50" />

        {/* Floating orbs */}
        <div className="pointer-events-none absolute right-[10%] top-[20%] size-64 rounded-full bg-gold-500/8 blur-[80px] animate-float" aria-hidden />
        <div className="pointer-events-none absolute left-[5%] bottom-0 size-48 rounded-full bg-info-500/6 blur-[60px] animate-float delay-300" aria-hidden />

        <div className="relative mx-auto max-w-[1400px] px-4 py-16 lg:px-8">
          <div className="animate-fade-up">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-gold-500/20 bg-gold-500/8 px-3 py-1">
              <Sparkles className="size-3.5 text-gold-300" />
              <span className="text-[11px] font-semibold uppercase tracking-widest text-gold-300">
                Your Workspaces
              </span>
            </div>
            <h1 className="font-display text-4xl font-medium tracking-tight sm:text-5xl">
              Launch a workspace
            </h1>
            <p className="mt-3 max-w-lg text-[15px] text-muted-foreground leading-relaxed">
              A secure, isolated desktop or application — streamed directly to your browser.
              Nothing to install, nothing left behind.
            </p>
          </div>

          {/* Search */}
          <div className="relative mt-7 max-w-sm animate-fade-up delay-100">
            <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search workspaces…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-11 pl-10 pr-4 text-sm"
            />
          </div>

          {/* Category pills */}
          {categories.length > 1 && (
            <div className="mt-4 flex flex-wrap gap-2 animate-fade-up delay-200">
              <button
                onClick={() => setQuery('')}
                className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                  !query
                    ? 'bg-gold-500/15 text-gold-300 ring-1 ring-gold-500/30'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                All
              </button>
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setQuery(cat)}
                  className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                    query === cat
                      ? 'bg-gold-500/15 text-gold-300 ring-1 ring-gold-500/30'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Grid */}
      <div className="mx-auto max-w-[1400px] px-4 py-10 lg:px-8">
        {enabled.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-24 text-center animate-fade-up">
            <div className="text-4xl">🔍</div>
            <p className="text-muted-foreground">No workspaces match your search.</p>
          </div>
        ) : (
          <div className="space-y-10">
            {/* Favorites section — only when present and not actively searching */}
            {favoriteList.length > 0 && (
              <section>
                <div className="mb-4 flex items-center gap-2">
                  <Star className="size-4 fill-gold-400 text-gold-300" />
                  <h2 className="font-display text-lg font-semibold">Favorites</h2>
                  <span className="text-xs text-muted-foreground">({favoriteList.length})</span>
                </div>
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {favoriteList.map(renderCard)}
                </div>
              </section>
            )}

            {/* All / remaining workspaces */}
            <section>
              {favoriteList.length > 0 && others.length > 0 && (
                <h2 className="mb-4 font-display text-lg font-semibold">All workspaces</h2>
              )}
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {others.map(renderCard)}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
