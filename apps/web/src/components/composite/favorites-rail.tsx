'use client';

import { Reorder, useDragControls } from 'framer-motion';
import { GripVertical } from 'lucide-react';
import { WorkspaceCard } from '@/components/composite/workspace-card';
import { useFavorites } from '@/lib/favorites-store';
import type { Workspace } from '@/lib/types';

/**
 * Horizontal shelf of a user's favorite desktops. Cards can be dragged by
 * their grip handle to reorder — the new order persists via the favorites
 * store and propagates everywhere favorites are shown.
 */
export function FavoritesRail({
  items,
  onLaunch,
  launchingId,
  onToggleFavorite,
}: {
  items: Workspace[];
  onLaunch: (id: string) => void;
  launchingId: string | null;
  onToggleFavorite: (id: string) => void;
}) {
  const reorder = useFavorites((s) => s.reorder);

  return (
    <Reorder.Group
      as="div"
      axis="x"
      values={items}
      onReorder={(next: Workspace[]) => reorder(next.map((w) => w.id))}
      className="flex gap-5 overflow-x-auto pb-2 [scrollbar-width:thin]"
    >
      {items.map((ws) => (
        <FavoriteRailItem
          key={ws.id}
          workspace={ws}
          onLaunch={onLaunch}
          launching={launchingId === ws.id}
          onToggleFavorite={onToggleFavorite}
        />
      ))}
    </Reorder.Group>
  );
}

function FavoriteRailItem({
  workspace,
  onLaunch,
  launching,
  onToggleFavorite,
}: {
  workspace: Workspace;
  onLaunch: (id: string) => void;
  launching: boolean;
  onToggleFavorite: (id: string) => void;
}) {
  const controls = useDragControls();

  return (
    <Reorder.Item
      as="div"
      value={workspace}
      dragListener={false}
      dragControls={controls}
      className="group/rail relative w-[300px] shrink-0"
      whileDrag={{ scale: 1.03, zIndex: 30, cursor: 'grabbing' }}
    >
      {/* Drag handle — only this starts a drag, so launch/star clicks are safe */}
      <button
        type="button"
        aria-label="Drag to reorder"
        onPointerDown={(e) => controls.start(e)}
        className="absolute left-1/2 top-1.5 z-20 flex h-5 w-8 -translate-x-1/2 cursor-grab touch-none items-center justify-center rounded-full bg-[var(--surface-3)]/80 text-muted-foreground/60 opacity-0 backdrop-blur transition-opacity hover:text-gold-300 group-hover/rail:opacity-100 active:cursor-grabbing"
      >
        <GripVertical className="size-3.5 rotate-90" />
      </button>

      <WorkspaceCard
        workspace={workspace}
        onLaunch={onLaunch}
        launching={launching}
        favorite
        onToggleFavorite={onToggleFavorite}
      />
    </Reorder.Item>
  );
}
