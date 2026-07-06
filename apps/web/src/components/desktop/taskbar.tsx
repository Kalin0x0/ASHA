'use client';

import { Loader2, Search } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { AppIcon } from '@/components/composite/app-icon';
import { BackgroundPicker } from '@/components/composite/background-picker';
import { InstallButton } from '@/components/composite/install-button';
import { LanguageSwitcher } from '@/components/composite/language-switcher';
import { ThemeToggle } from '@/components/theme-toggle';
import { TariffChip } from '@/components/desktop/tariff-chip';
import { LiquidGlass } from '@/components/ui/liquid-glass';
import { orderByFavorites, useFavorites } from '@/lib/favorites-store';
import type { SessionRow, Workspace } from '@/lib/types';
import { cn } from '@/lib/utils';

/** Pinned + running apps shown on the bar (rest live in the Start menu). */
const MAX_TASKBAR_APPS = 12;

/**
 * A Windows-style four-pane Start mark — an original geometric glyph (a 2×2 grid
 * of rounded gold tiles), not any vendor's logo art.
 */
export function StartGlyph({ className }: { className?: string }) {
  return (
    <span className={cn('grid grid-cols-2 gap-[3px]', className)} aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className="block size-[7px] rounded-[2px] bg-gold-300 shadow-[0_0_5px_rgba(212,175,55,0.55)]" />
      ))}
    </span>
  );
}

/**
 * The Windows-12-style taskbar: a single floating glass bar, centered at the
 * bottom. Start button + search open the Start menu; pinned (favorited) and
 * running workspaces sit in the middle with a running-underline indicator; the
 * system tray (quick toggles + live clock) is pinned to the end.
 */
export function Taskbar({
  workspaces,
  sessions,
  launchingId,
  startOpen,
  onToggleStart,
  onAppClick,
}: {
  workspaces: Workspace[];
  sessions: SessionRow[];
  launchingId: string | null;
  startOpen: boolean;
  onToggleStart: () => void;
  onAppClick: (ws: Workspace) => void;
}) {
  const t = useTranslations('portal');
  const favorites = useFavorites();

  const runningNames = useMemo(() => new Set(sessions.map((s) => s.workspaceName)), [sessions]);

  // Pinned = favorites (in saved order); plus any running-but-not-pinned app.
  const apps = useMemo(() => {
    const enabled = workspaces
      .filter((w) => w.enabled)
      .sort((a, b) => a.friendlyName.localeCompare(b.friendlyName));
    const favs = orderByFavorites(enabled, favorites.ids);
    const runningExtra = enabled.filter(
      (w) => !favorites.ids.includes(w.id) && runningNames.has(w.friendlyName),
    );
    return [...favs, ...runningExtra].slice(0, MAX_TASKBAR_APPS);
  }, [workspaces, favorites.ids, runningNames]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-2.5 z-30 flex justify-center px-2">
      <LiquidGlass
        radius="rounded-2xl"
        distort
        tint="var(--glass-tint-strong)"
        className="pointer-events-auto max-w-[calc(100vw-1rem)] border border-white/12"
      >
        <div className="flex items-center gap-1 p-1.5">
          {/* Start */}
          <TaskbarButton active={startOpen} label={t('desktop.taskbar.start')} onClick={onToggleStart}>
            <StartGlyph className="size-[18px]" />
          </TaskbarButton>

          {/* Search — also opens Start (its search field autofocuses) */}
          <button
            type="button"
            onClick={onToggleStart}
            aria-label={t('desktop.taskbar.search')}
            className="hidden h-9 items-center gap-2 rounded-lg bg-white/8 px-3 text-[13px] text-muted-foreground transition-colors hover:bg-white/12 ring-gold-focus sm:flex"
          >
            <Search className="size-3.5" aria-hidden />
            <span>{t('desktop.taskbar.search')}</span>
          </button>

          {apps.length > 0 && <span aria-hidden className="mx-0.5 h-7 w-px shrink-0 bg-white/12" />}

          {/* Pinned + running apps — the only horizontally-scrollable region */}
          <div className="flex min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:none]">
            {apps.map((ws) => (
              <TaskbarApp
                key={ws.id}
                label={ws.friendlyName}
                running={runningNames.has(ws.friendlyName)}
                launching={launchingId === ws.id}
                onClick={() => onAppClick(ws)}
              >
                <AppIcon
                  name={ws.friendlyName}
                  dockerImage={ws.dockerImage}
                  category={ws.category}
                  iconUrl={ws.iconUrl}
                  rounded="rounded-lg"
                  className="size-full"
                />
              </TaskbarApp>
            ))}
          </div>

          {/* System tray */}
          <span aria-hidden className="mx-0.5 h-7 w-px shrink-0 bg-white/12" />
          <div className="flex shrink-0 items-center gap-0.5">
            <TariffChip className="me-1 hidden sm:inline-flex" />
            <InstallButton className="hidden lg:inline-flex" />
            <BackgroundPicker />
            <LanguageSwitcher />
            <ThemeToggle />
            <TrayClock />
          </div>
        </div>
      </LiquidGlass>
    </div>
  );
}

/** Start button / generic square taskbar button. */
function TaskbarButton({
  active,
  label,
  onClick,
  children,
}: {
  active?: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cn(
        'flex size-11 shrink-0 items-center justify-center rounded-lg outline-none transition-colors ring-gold-focus',
        active ? 'bg-white/15' : 'hover:bg-white/10',
      )}
    >
      {children}
    </button>
  );
}

/** A pinned/running app tile with a Windows-style running underline. */
function TaskbarApp({
  label,
  running,
  launching,
  onClick,
  children,
}: {
  label: string;
  running: boolean;
  launching: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="relative flex size-11 shrink-0 items-center justify-center rounded-lg outline-none transition-colors hover:bg-white/10 ring-gold-focus"
    >
      <span className={cn('block size-8', launching && 'animate-pulse')}>{children}</span>
      {launching && (
        <span className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="size-4 animate-spin text-white drop-shadow" aria-hidden />
        </span>
      )}
      {/* Running indicator — a short gold underbar (Windows taskbar style). */}
      {running && (
        <span
          aria-hidden
          className="absolute bottom-[3px] left-1/2 h-[3px] w-4 -translate-x-1/2 rounded-full bg-gold-400 shadow-[0_0_6px_rgba(212,175,55,0.7)]"
        />
      )}
    </button>
  );
}

/** Two-line locale-aware tray clock (Persian calendar in fa). */
function TrayClock() {
  const locale = useLocale();
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = setInterval(tick, 15_000);
    return () => clearInterval(id);
  }, []);

  // Fixed-width placeholder pre-mount to avoid a hydration mismatch.
  if (!now) return <span className="ms-1 inline-block h-8 w-14" aria-hidden />;

  const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(now);
  const date = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'numeric', year: 'numeric' }).format(now);

  return (
    <span className="ms-1 flex flex-col items-end justify-center px-2 text-[11px] font-medium leading-tight tabular-nums text-foreground/90">
      <span>{time}</span>
      <span className="text-muted-foreground">{date}</span>
    </span>
  );
}
