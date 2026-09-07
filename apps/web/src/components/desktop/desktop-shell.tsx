'use client';

import { useEffect, useState } from 'react';
import { ClassicDesktop } from '@/components/desktop/classic-desktop';
import { Desktop } from '@/components/desktop/desktop';
import { MacDesktop } from '@/components/desktop/mac-desktop';
import { ProfileDialog } from '@/components/desktop/profile-dialog';
import { DEFAULT_SHELL_MODE, useShell } from '@/lib/shell-store';
import { useIsHandheld } from '@/lib/use-handheld';

/**
 * Renders the portal in the desktop style the user picked (Background panel →
 * "Desktop style"): Windows, macOS or the classic launcher. Gated on mount so
 * the first client paint matches the server (the default shell), then swaps to
 * the persisted choice — no hydration mismatch.
 *
 * A phone gets the classic launcher whatever the preference says: free-dragged
 * icons on an 88px grid, a taskbar and floating session windows all assume a
 * pointer and about a thousand pixels of width. The stored choice is left alone,
 * so the same account still opens its Windows or macOS shell on a desktop.
 */
export function DesktopShell() {
  const mode = useShell((s) => s.mode);
  const handheld = useIsHandheld();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const active = !mounted ? DEFAULT_SHELL_MODE : handheld ? 'classic' : mode;
  return (
    <>
      {active === 'macos' ? <MacDesktop /> : active === 'classic' ? <ClassicDesktop /> : <Desktop />}
      {/* One profile dialog for every shell; opened from the top bar / Start menu. */}
      <ProfileDialog />
    </>
  );
}
