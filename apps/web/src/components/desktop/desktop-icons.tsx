'use client';

import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { AppIcon } from '@/components/composite/app-icon';
import { orderByFavorites, useFavorites } from '@/lib/favorites-store';
import type { Workspace } from '@/lib/types';
import { cn } from '@/lib/utils';

/**
 * Desktop shortcut icons — a workspace that the user favorites (pins) shows up
 * here as an icon on the desktop, Windows-style: laid out top-to-bottom then
 * wrapping into the next column at the top-start corner. Single click selects,
 * double click (or Enter) launches. Empty when nothing is pinned.
 */
export function DesktopIcons({
  workspaces,
  launchingId,
  onLaunch,
}: {
  workspaces: Workspace[];
  launchingId: string | null;
  onLaunch: (id: string) => void;
}) {
  const favorites = useFavorites();
  const [selected, setSelected] = useState<string | null>(null);

  const favWorkspaces = useMemo(
    () => orderByFavorites(workspaces.filter((w) => w.enabled), favorites.ids),
    [workspaces, favorites.ids],
  );

  // Clear the selection on Escape (matches Windows desktop behavior).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (favWorkspaces.length === 0) return null;

  return (
    // Wrapper is click-through; only the icon tiles capture pointer events, so
    // the wallpaper, windows and taskbar behind stay fully interactive.
    <div className="pointer-events-none absolute inset-0 z-10">
      <div className="pointer-events-auto absolute start-2 top-2 flex max-h-[calc(100dvh-8rem)] flex-col flex-wrap content-start gap-0.5">
        {favWorkspaces.map((ws) => (
          <DesktopIcon
            key={ws.id}
            workspace={ws}
            selected={selected === ws.id}
            launching={launchingId === ws.id}
            onSelect={() => setSelected(ws.id)}
            onOpen={() => onLaunch(ws.id)}
          />
        ))}
      </div>
    </div>
  );
}

function DesktopIcon({
  workspace: ws,
  selected,
  launching,
  onSelect,
  onOpen,
}: {
  workspace: Workspace;
  selected: boolean;
  launching: boolean;
  onSelect: () => void;
  onOpen: () => void;
}) {
  const t = useTranslations('portal');
  return (
    <button
      type="button"
      onClick={onSelect}
      onDoubleClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      aria-label={t('desktop.icons.openAria', { name: ws.friendlyName })}
      title={ws.friendlyName}
      className={cn(
        'group flex w-[84px] flex-col items-center gap-1.5 rounded-lg border p-2 text-center outline-none transition-colors ring-gold-focus',
        selected
          ? 'border-gold-500/40 bg-gold-500/20'
          : 'border-transparent hover:border-white/10 hover:bg-white/10',
      )}
    >
      <span className="relative">
        <AppIcon
          name={ws.friendlyName}
          dockerImage={ws.dockerImage}
          category={ws.category}
          iconUrl={ws.iconUrl}
          rounded="rounded-xl"
          className={cn('size-11', launching && 'opacity-60')}
        />
        {launching && (
          <span className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="size-5 animate-spin text-anthracite-900" aria-hidden />
          </span>
        )}
      </span>
      {/* White label with a strong shadow so it stays legible on any wallpaper. */}
      <span className="line-clamp-2 text-[11px] font-medium leading-tight text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.9)]">
        {ws.friendlyName}
      </span>
    </button>
  );
}
