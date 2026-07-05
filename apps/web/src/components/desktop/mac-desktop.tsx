'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Dock } from '@/components/desktop/dock';
import { LaunchOverlay } from '@/components/desktop/launch-overlay';
import { Launchpad } from '@/components/desktop/launchpad';
import { MenuBar } from '@/components/desktop/menu-bar';
import { SessionWindows, sessionViewerPath, useMySessions } from '@/components/desktop/session-windows';
import { useWorkspaceLaunch } from '@/components/desktop/use-workspace-launch';
import { LaunchDialog } from '@/components/composite/launch-dialog';
import { GlassFilter } from '@/components/ui/liquid-glass';
import { useResumeSession } from '@/lib/hooks';
import { launchTransition } from '@/lib/launch-overlay-store';
import type { Workspace } from '@/lib/types';

/**
 * The macOS-style shell: a thin translucent menu bar, open sessions as windows
 * with traffic lights, a magnifying dock, and a Launchpad (⌘K). Selected via
 * the Background panel's "Desktop style" control.
 */
export function MacDesktop() {
  const t = useTranslations('portal');
  const router = useRouter();
  const { workspaces, launchingId, launchTarget, setLaunchTarget, onLaunch, launchWebNative } =
    useWorkspaceLaunch();
  const mySessions = useMySessions();
  const resume = useResumeSession();
  const [launchpadOpen, setLaunchpadOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setLaunchpadOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onDockWorkspace = (ws: Workspace) => {
    const live = mySessions
      .filter((s) => s.workspaceName === ws.friendlyName)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (live) {
      if (live.status === 'PAUSED') resume(live.id);
      launchTransition(
        { name: ws.friendlyName, iconUrl: ws.iconUrl, dockerImage: ws.dockerImage, category: ws.category },
        () => router.push(sessionViewerPath(live)),
      );
      return;
    }
    onLaunch(ws.id);
  };

  return (
    // The macOS shell keeps a thin top menu bar; the CSS var keeps descendant
    // height calcs (sticky offsets) in sync with its 38px height.
    <div className="relative flex min-h-[100dvh] flex-col" style={{ ['--spacing-topbar' as string]: '38px' }}>
      <GlassFilter />
      <MenuBar />
      <div className="relative flex min-h-[calc(100dvh-var(--spacing-topbar))] flex-1 flex-col">
        <div className="flex flex-1 flex-col overflow-y-auto px-4 pb-36 pt-8 sm:px-8">
          {mySessions.length === 0 ? (
            <MacGreeting onOpenLaunchpad={() => setLaunchpadOpen(true)} />
          ) : (
            <div className="mx-auto w-full max-w-6xl">
              <div className="mb-5 flex items-center justify-center gap-2">
                <span className="size-2 rounded-full bg-success animate-pulse-ring" aria-hidden />
                <h1 className="font-display text-sm font-semibold tracking-tight">{t('mySessions.title')}</h1>
                <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
                  {mySessions.length}
                </span>
              </div>
              <SessionWindows sessions={mySessions} chrome="mac" />
            </div>
          )}
        </div>

        <Dock
          workspaces={workspaces}
          sessions={mySessions}
          launchingId={launchingId}
          onWorkspaceClick={onDockWorkspace}
          onOpenLaunchpad={() => setLaunchpadOpen((o) => !o)}
          launchpadOpen={launchpadOpen}
        />

        <Launchpad
          open={launchpadOpen}
          onClose={() => setLaunchpadOpen(false)}
          workspaces={workspaces}
          launchingId={launchingId}
          onLaunch={onLaunch}
        />

        <LaunchDialog
          workspace={launchTarget}
          open={launchTarget !== null}
          onOpenChange={(o) => !o && setLaunchTarget(null)}
          onWebNative={(ws) => void launchWebNative(ws.id)}
          launching={launchingId !== null}
        />

        {/* Session-opening animation */}
        <LaunchOverlay />
      </div>
    </div>
  );
}

/** Empty-desktop hero: a large lock-screen clock + greeting + Launchpad hint. */
function MacGreeting({ onOpenLaunchpad }: { onOpenLaunchpad: () => void }) {
  const t = useTranslations('portal');
  const locale = useLocale();
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = setInterval(tick, 15_000);
    return () => clearInterval(id);
  }, []);

  const greetingKey = useMemo(() => {
    const h = (now ?? new Date()).getHours();
    if (h < 12) return 'morning' as const;
    if (h < 18) return 'afternoon' as const;
    return 'evening' as const;
  }, [now]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
      {now ? (
        <>
          <p className="font-display text-[clamp(3.5rem,10vw,6.5rem)] font-semibold leading-none tracking-tight tabular-nums">
            {new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(now)}
          </p>
          <p className="text-lg font-medium text-foreground/90">
            {new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(now)}
          </p>
        </>
      ) : (
        <span className="block h-[9.5rem]" aria-hidden />
      )}
      <p className="mt-4 text-sm font-medium text-foreground/85">{t(`desktop.greeting.${greetingKey}`)}</p>
      <button
        type="button"
        onClick={onOpenLaunchpad}
        className="mt-1 inline-flex items-center gap-2 rounded-full border border-border-subtle glass px-4 py-1.5 text-[13px] text-muted-foreground transition-colors hover:border-gold-500/30 hover:text-foreground ring-gold-focus"
      >
        {t('desktop.greeting.hint')}
        <kbd className="rounded-md border border-border-subtle bg-secondary px-1.5 py-0.5 text-[10px] font-medium">⌘K</kbd>
      </button>
    </div>
  );
}
