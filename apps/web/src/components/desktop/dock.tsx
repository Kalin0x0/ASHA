'use client';

import { motion, useMotionValue, useSpring, useTransform, type MotionValue } from 'framer-motion';
import { LayoutGrid } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useRef } from 'react';
import { AppIcon } from '@/components/composite/app-icon';
import { LiquidGlass } from '@/components/ui/liquid-glass';
import { orderByFavorites, useFavorites } from '@/lib/favorites-store';
import type { SessionRow, Workspace } from '@/lib/types';
import { cn } from '@/lib/utils';

/** Base / peak icon sizes for the magnification curve (px). */
const ICON = 48;
const ICON_MAX = 78;
/** How far (px) the magnification field reaches from the cursor. */
const REACH = 150;
/** Show at most this many workspace icons; the rest live in the Launchpad. */
const MAX_ICONS = 14;

/**
 * The macOS-style dock: the user's workspaces as magnifying icons (favorites
 * first), gold running-dots for workspaces with a live session, a launch
 * bounce, and a Launchpad tile at the end.
 */
export function Dock({
  workspaces,
  sessions,
  launchingId,
  onWorkspaceClick,
  onOpenLaunchpad,
  launchpadOpen,
}: {
  workspaces: Workspace[];
  /** The signed-in user's ACTIVE sessions (running/paused/starting). */
  sessions: SessionRow[];
  launchingId: string | null;
  onWorkspaceClick: (ws: Workspace) => void;
  onOpenLaunchpad: () => void;
  launchpadOpen: boolean;
}) {
  const t = useTranslations('portal');
  const favorites = useFavorites();
  const mouseX = useMotionValue(Infinity);

  const items = useMemo(() => {
    const enabled = workspaces
      .filter((w) => w.enabled)
      .sort((a, b) => a.friendlyName.localeCompare(b.friendlyName));
    // orderByFavorites returns ONLY the favorited items (in the user's saved
    // order); float those to the front, then the rest, then cap the dock length.
    const favs = orderByFavorites(enabled, favorites.ids);
    const rest = enabled.filter((w) => !favorites.ids.includes(w.id));
    return [...favs, ...rest].slice(0, MAX_ICONS);
  }, [workspaces, favorites.ids]);

  const runningNames = useMemo(() => new Set(sessions.map((s) => s.workspaceName)), [sessions]);

  return (
    <nav
      aria-label={t('desktop.dock.label')}
      className="pointer-events-none fixed inset-x-0 bottom-3 z-30 flex justify-center px-3"
    >
      <LiquidGlass
        radius="rounded-[1.7rem]"
        distort
        clip={false}
        tint="var(--glass-tint-strong)"
        className="pointer-events-auto max-w-[calc(100vw-1.5rem)] border border-white/12"
      >
        <motion.div
          onMouseMove={(e) => mouseX.set(e.pageX)}
          onMouseLeave={() => mouseX.set(Infinity)}
          className="flex items-end gap-1.5 px-2.5 pb-2 pt-2"
        >
        {items.map((ws) => (
          <DockItem
            key={ws.id}
            mouseX={mouseX}
            label={ws.friendlyName}
            aria={t('desktop.dock.launch', { name: ws.friendlyName })}
            running={runningNames.has(ws.friendlyName)}
            launching={launchingId === ws.id}
            onClick={() => onWorkspaceClick(ws)}
          >
            <AppIcon
              name={ws.friendlyName}
              dockerImage={ws.dockerImage}
              category={ws.category}
              iconUrl={ws.iconUrl}
              rounded="rounded-xl"
              className="size-full"
            />
          </DockItem>
        ))}

        {/* Divider + Launchpad */}
        <span aria-hidden className="mx-1 mb-1 h-10 w-px shrink-0 self-end bg-border-subtle" />
        <DockItem
          mouseX={mouseX}
          label={t('desktop.dock.launchpad')}
          aria={t('desktop.dock.launchpadAria')}
          running={false}
          launching={false}
          active={launchpadOpen}
          onClick={onOpenLaunchpad}
        >
          <span className="flex size-full items-center justify-center rounded-xl border border-gold-500/25 bg-[radial-gradient(120%_120%_at_50%_0%,#2a2a4a,#14141f)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
            <LayoutGrid className="size-[46%] text-gold-300" aria-hidden />
          </span>
        </DockItem>
        </motion.div>
      </LiquidGlass>
    </nav>
  );
}

function DockItem({
  mouseX,
  label,
  aria,
  running,
  launching,
  active = false,
  onClick,
  children,
}: {
  mouseX: MotionValue<number>;
  label: string;
  aria: string;
  running: boolean;
  launching: boolean;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLButtonElement>(null);

  // Classic dock physics: icon width follows the cursor's distance to the
  // icon's center, smoothed by a spring. Distance math is LTR/RTL-agnostic
  // (absolute page coordinates).
  const distance = useTransform(mouseX, (x) => {
    const b = ref.current?.getBoundingClientRect();
    if (!b) return Infinity;
    return x - (b.x + window.scrollX) - b.width / 2;
  });
  const widthRaw = useTransform(distance, [-REACH, 0, REACH], [ICON, ICON_MAX, ICON]);
  const width = useSpring(widthRaw, { mass: 0.1, stiffness: 180, damping: 14 });

  return (
    <motion.button
      ref={ref}
      type="button"
      onClick={onClick}
      style={{ width }}
      aria-label={aria}
      title={label}
      className="group relative aspect-square shrink-0 rounded-xl outline-none ring-gold-focus"
    >
      {/* Launch bounce (macOS app-opening bounce) */}
      <motion.span
        className="block size-full"
        animate={launching ? { y: [0, -14, 0] } : { y: 0 }}
        transition={launching ? { duration: 0.65, ease: 'easeInOut', repeat: Infinity } : { duration: 0.2 }}
      >
        {children}
      </motion.span>

      {/* Name tooltip above the icon */}
      <span
        role="presentation"
        className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md border border-border-subtle glass-strong px-2 py-1 text-[11px] font-medium opacity-0 shadow-[var(--shadow-ambient)] transition-opacity duration-150 group-hover:opacity-100"
      >
        {label}
      </span>

      {/* Running / active indicator dot */}
      {(running || active) && (
        <span
          aria-hidden
          className={cn(
            'absolute -bottom-[7px] left-1/2 size-1 -translate-x-1/2 rounded-full',
            running ? 'bg-gold-400 shadow-[0_0_6px_rgba(212,175,55,0.8)]' : 'bg-foreground/60',
          )}
        />
      )}
    </motion.button>
  );
}
