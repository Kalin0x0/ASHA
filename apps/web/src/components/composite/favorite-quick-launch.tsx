'use client';

import { Loader2, Play, Star } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Monogram } from '@/components/composite/monogram';
import { useFavorites } from '@/lib/favorites-store';
import { useLaunchSession, useWorkspaces } from '@/lib/hooks';

/**
 * Compact favorites strip for the portal header — one-click launch of a
 * user's starred desktops from anywhere in the portal.
 */
export function FavoriteQuickLaunch() {
  const router = useRouter();
  const workspaces = useWorkspaces();
  const launch = useLaunchSession();
  const favorites = useFavorites();
  const [launchingId, setLaunchingId] = useState<string | null>(null);

  const favWorkspaces = useMemo(
    () => workspaces.filter((w) => w.enabled && favorites.ids.includes(w.id)),
    [workspaces, favorites.ids],
  );

  if (favWorkspaces.length === 0) return null;

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

  return (
    <div className="hidden items-center gap-2 md:flex">
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
        <Star className="size-3.5 fill-gold-400 text-gold-300" />
        Favorites
      </span>
      <div className="flex items-center gap-1.5">
        {favWorkspaces.slice(0, 5).map((ws) => {
          const busy = launchingId === ws.id;
          return (
            <button
              key={ws.id}
              type="button"
              onClick={() => void onLaunch(ws.id)}
              disabled={busy}
              title={`Launch ${ws.friendlyName}`}
              className="group flex items-center gap-1.5 rounded-full border border-border-subtle bg-[var(--surface-2)]/60 py-1 pl-1 pr-2.5 text-xs transition-all duration-200 hover:border-[rgba(212,175,55,0.35)] hover:bg-[var(--surface-2)] hover:shadow-[0_0_0_1px_rgba(212,175,55,0.15)] disabled:opacity-60 ring-gold-focus"
            >
              <Monogram name={ws.friendlyName} className="size-5 rounded-full text-[9px]" />
              <span className="max-w-[110px] truncate font-medium text-foreground">{ws.friendlyName}</span>
              {busy ? (
                <Loader2 className="size-3 animate-spin text-gold-300" />
              ) : (
                <Play className="size-3 text-muted-foreground/50 transition-colors group-hover:text-gold-300" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
