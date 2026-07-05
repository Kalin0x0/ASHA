'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { DesktopIcons } from '@/components/desktop/desktop-icons';
import { LaunchOverlay } from '@/components/desktop/launch-overlay';
import { SessionWindows, sessionViewerPath, useMySessions } from '@/components/desktop/session-windows';
import { StartMenu } from '@/components/desktop/start-menu';
import { Taskbar } from '@/components/desktop/taskbar';
import { useWorkspaceLaunch } from '@/components/desktop/use-workspace-launch';
import { LaunchDialog } from '@/components/composite/launch-dialog';
import { GlassFilter } from '@/components/ui/liquid-glass';
import { useFavorites } from '@/lib/favorites-store';
import { useResumeSession } from '@/lib/hooks';
import { launchTransition } from '@/lib/launch-overlay-store';
import type { SessionRow, Workspace } from '@/lib/types';

/**
 * The Asha OS desktop — the end-user portal as a Windows-12-style operating
 * system: wallpaper (AppBackground behind), pinned workspaces as desktop icons,
 * open sessions as windows, a floating taskbar with a Start button + system
 * tray, and a Start menu. Clean by design.
 */
export function Desktop() {
  const router = useRouter();
  const { workspaces, launchingId, launchTarget, setLaunchTarget, onLaunch, launchWebNative } =
    useWorkspaceLaunch();
  const mySessions = useMySessions();
  const resume = useResumeSession();
  const hasFavorites = useFavorites((s) => s.ids.length > 0);
  const [startOpen, setStartOpen] = useState(false);

  // Ctrl/Cmd+K toggles the Start menu (its search field autofocuses).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setStartOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Taskbar app click: focus the newest live session of that workspace, else launch.
  const onAppClick = (ws: Workspace) => {
    const live = mySessions
      .filter((s) => s.workspaceName === ws.friendlyName)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (live) {
      openSession(live);
      return;
    }
    onLaunch(ws.id);
  };

  const openSession = (s: SessionRow) => {
    if (s.status === 'PAUSED') resume(s.id);
    const ws = workspaces.find((w) => w.friendlyName === s.workspaceName);
    launchTransition(
      { name: s.workspaceName, iconUrl: ws?.iconUrl, dockerImage: ws?.dockerImage, category: ws?.category },
      () => router.push(sessionViewerPath(s)),
    );
  };

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden">
      {/* Shared SVG refraction filter for every liquid-glass surface. */}
      <GlassFilter />

      {/* Open sessions as windows — click-through wrapper so the desktop icons
          behind it stay reachable; only the windows themselves are interactive. */}
      <div className="pointer-events-none absolute inset-0 z-10 flex items-start justify-center overflow-y-auto px-4 pb-28 pt-12 sm:pt-16">
        {mySessions.length > 0 ? (
          <div className="pointer-events-auto w-full max-w-6xl">
            <SessionWindows sessions={mySessions} />
          </div>
        ) : (
          !hasFavorites && <DesktopEmptyHint onOpenStart={() => setStartOpen(true)} />
        )}
      </div>

      {/* Pinned workspaces as desktop shortcut icons (top-start). */}
      <DesktopIcons workspaces={workspaces} launchingId={launchingId} onLaunch={onLaunch} />

      <Taskbar
        workspaces={workspaces}
        sessions={mySessions}
        launchingId={launchingId}
        startOpen={startOpen}
        onToggleStart={() => setStartOpen((o) => !o)}
        onAppClick={onAppClick}
      />

      <StartMenu
        open={startOpen}
        onClose={() => setStartOpen(false)}
        workspaces={workspaces}
        sessions={mySessions}
        launchingId={launchingId}
        onLaunch={onLaunch}
        onOpenSession={openSession}
      />

      {/* RDP desktops: "Web Native vs RDP Client" chooser (z-50, above all) */}
      <LaunchDialog
        workspace={launchTarget}
        open={launchTarget !== null}
        onOpenChange={(o) => !o && setLaunchTarget(null)}
        onWebNative={(ws) => void launchWebNative(ws.id)}
        launching={launchingId !== null}
      />

      {/* Session-opening animation (z-60, above the taskbar/start) */}
      <LaunchOverlay />
    </div>
  );
}

/**
 * Shown only on a truly empty desktop (no open sessions AND nothing pinned):
 * a quiet, centered hint pointing at the Start menu.
 */
function DesktopEmptyHint({ onOpenStart }: { onOpenStart: () => void }) {
  const t = useTranslations('portal');
  return (
    <div className="pointer-events-auto flex flex-1 flex-col items-center justify-center gap-3 text-center">
      <p className="text-sm font-medium text-foreground/85 [text-shadow:0_1px_4px_rgba(0,0,0,0.6)]">
        {t('desktop.emptyHint')}
      </p>
      <button
        type="button"
        onClick={onOpenStart}
        className="inline-flex items-center gap-2 rounded-full border border-white/12 glass px-4 py-1.5 text-[13px] text-foreground/90 transition-colors hover:border-gold-500/30 ring-gold-focus"
      >
        {t('desktop.taskbar.start')}
        <kbd className="rounded-md border border-white/12 bg-white/10 px-1.5 py-0.5 text-[10px] font-medium">⌘K</kbd>
      </button>
    </div>
  );
}
