'use client';

import { WorkstationLauncher } from '@/components/composite/workstation-launcher';
import { MenuBar } from '@/components/desktop/menu-bar';

/**
 * The classic shell: the original workspace launcher (hero + search + category
 * rail + favorites + catalog grid) under a thin top bar. Selected via the
 * Background panel's "Desktop style" control.
 */
export function ClassicDesktop() {
  return (
    <div className="relative flex min-h-[100dvh] flex-col" style={{ ['--spacing-topbar' as string]: '38px' }}>
      <MenuBar />
      <div className="relative z-10 flex-1">
        <WorkstationLauncher />
      </div>
    </div>
  );
}
