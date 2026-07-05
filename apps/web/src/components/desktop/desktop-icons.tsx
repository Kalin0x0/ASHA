'use client';

import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppIcon } from '@/components/composite/app-icon';
import { orderByFavorites, useFavorites } from '@/lib/favorites-store';
import { type IconPos, useDesktopLayout } from '@/lib/desktop-layout-store';
import type { Workspace } from '@/lib/types';
import { cn } from '@/lib/utils';

// Icon-cell geometry (px). Placement snaps to this grid so free-dragged icons
// still line up cleanly (Windows' "align icons to grid").
const CELL_W = 88;
const CELL_H = 96;
const MARGIN = 8;
const TASKBAR = 104; // reserved bottom band so icons never hide under the taskbar
const DRAG_THRESHOLD = 4; // px before a press becomes a drag (vs a click)

interface DragState {
  id: string;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  lastX: number;
  lastY: number;
  moved: boolean;
}

/**
 * Desktop shortcut icons — a workspace the user favorites (pins) shows up here as
 * an icon on the desktop (Windows shell). Icons can be **dragged anywhere** and
 * their positions persist per browser; unmoved icons flow into an auto column
 * grid from the top-start corner. Press-and-drag moves, double click (or Enter)
 * launches.
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
  const layout = useDesktopLayout();
  const [selected, setSelected] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [rtl, setRtl] = useState(false);
  const [viewport, setViewport] = useState({ w: 1280, h: 800 });
  const dragRef = useRef<DragState | null>(null);
  const [live, setLive] = useState<{ id: string; x: number; y: number } | null>(null);

  const favWorkspaces = useMemo(
    () => orderByFavorites(workspaces.filter((w) => w.enabled), favorites.ids),
    [workspaces, favorites.ids],
  );

  // Gate on mount: positions + favorites live in localStorage, so rendering
  // before hydration would mismatch the (empty) server render. Also track the
  // viewport + text direction for clamping and the default grid.
  useEffect(() => {
    setMounted(true);
    setRtl(document.documentElement.dir === 'rtl');
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Clear the selection on Escape (matches the Windows desktop).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const clamp = useCallback(
    (p: IconPos): IconPos => ({
      x: Math.max(MARGIN, Math.min(p.x, viewport.w - CELL_W - MARGIN)),
      y: Math.max(MARGIN, Math.min(p.y, viewport.h - CELL_H - TASKBAR)),
    }),
    [viewport],
  );

  // Auto grid slot for an icon that has never been moved: fill top→bottom then
  // wrap to the next column. Mirrors to the right edge in RTL.
  const autoSlot = useCallback(
    (index: number): IconPos => {
      const rows = Math.max(1, Math.floor((viewport.h - TASKBAR - MARGIN) / CELL_H));
      const col = Math.floor(index / rows);
      const row = index % rows;
      const x = rtl ? viewport.w - CELL_W - MARGIN - col * CELL_W : MARGIN + col * CELL_W;
      return clamp({ x, y: MARGIN + row * CELL_H });
    },
    [viewport, rtl, clamp],
  );

  const posFor = useCallback(
    (ws: Workspace, index: number): IconPos => {
      if (live && live.id === ws.id) return { x: live.x, y: live.y };
      const stored = layout.positions[ws.id];
      return stored ? clamp(stored) : autoSlot(index);
    },
    [live, layout.positions, clamp, autoSlot],
  );

  // Drag via pointer capture: every pointermove/up is delivered to the icon
  // element until release, regardless of what's under the cursor or of
  // re-renders — the W3C-recommended drag pattern.
  const onDragStart = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>, ws: Workspace, index: number) => {
      if (e.button !== 0) return; // left button only
      const origin = posFor(ws, index);
      dragRef.current = {
        id: ws.id,
        startX: e.clientX,
        startY: e.clientY,
        originX: origin.x,
        originY: origin.y,
        lastX: origin.x,
        lastY: origin.y,
        moved: false,
      };
      setSelected(ws.id);
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* capture unsupported — the button still receives events while pressed */
      }
    },
    [posFor],
  );

  const onDragMove = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      const d = dragRef.current;
      if (!d || d.id !== e.currentTarget.dataset.wsId) return;
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      d.moved = true;
      const p = clamp({ x: d.originX + dx, y: d.originY + dy });
      d.lastX = p.x;
      d.lastY = p.y;
      setLive({ id: d.id, x: p.x, y: p.y });
    },
    [clamp],
  );

  const onDragEnd = useCallback(() => {
    const d = dragRef.current;
    dragRef.current = null;
    if (d?.moved) {
      // Snap to the icon grid, then clamp back into view, and persist.
      layout.setPosition(
        d.id,
        clamp({
          x: MARGIN + Math.round((d.lastX - MARGIN) / CELL_W) * CELL_W,
          y: MARGIN + Math.round((d.lastY - MARGIN) / CELL_H) * CELL_H,
        }),
      );
    }
    setLive(null);
  }, [clamp, layout]);

  if (!mounted || favWorkspaces.length === 0) return null;

  return (
    // Click-through wrapper; only the icon tiles capture pointer events, so the
    // wallpaper, windows and taskbar behind stay fully interactive.
    <div className="pointer-events-none absolute inset-0 z-10">
      {favWorkspaces.map((ws, i) => {
        const pos = posFor(ws, i);
        return (
          <DesktopIcon
            key={ws.id}
            workspace={ws}
            pos={pos}
            dragging={live?.id === ws.id}
            selected={selected === ws.id}
            launching={launchingId === ws.id}
            onPointerDown={(e) => onDragStart(e, ws, i)}
            onPointerMove={onDragMove}
            onPointerUp={onDragEnd}
            onOpen={() => onLaunch(ws.id)}
          />
        );
      })}
    </div>
  );
}

function DesktopIcon({
  workspace: ws,
  pos,
  dragging,
  selected,
  launching,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onOpen,
}: {
  workspace: Workspace;
  pos: IconPos;
  dragging: boolean;
  selected: boolean;
  launching: boolean;
  onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onOpen: () => void;
}) {
  const t = useTranslations('portal');
  return (
    <button
      type="button"
      data-ws-id={ws.id}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      aria-label={t('desktop.icons.openAria', { name: ws.friendlyName })}
      title={ws.friendlyName}
      style={{ left: pos.x, top: pos.y, width: CELL_W, touchAction: 'none' }}
      className={cn(
        'group pointer-events-auto absolute flex select-none flex-col items-center gap-1.5 rounded-lg border p-2 text-center outline-none ring-gold-focus',
        dragging
          ? 'z-20 cursor-grabbing border-gold-500/50 bg-gold-500/25 shadow-[var(--shadow-ambient)]'
          : 'cursor-grab transition-[background-color,border-color]',
        !dragging && (selected ? 'border-gold-500/40 bg-gold-500/20' : 'border-transparent hover:border-white/10 hover:bg-white/10'),
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
      <span className="pointer-events-none line-clamp-2 text-[11px] font-medium leading-tight text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.9)]">
        {ws.friendlyName}
      </span>
    </button>
  );
}
