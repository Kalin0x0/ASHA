'use client';

import { useEffect, useState } from 'react';
import { CommandPalette } from '@/components/shell/command-palette';
import { SidebarContent } from '@/components/shell/sidebar';
import { Topbar } from '@/components/shell/topbar';
import { useUIStore } from '@/lib/ui-store';
import { cn } from '@/lib/utils';

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { sidebarCollapsed, mobileOpen, setMobileOpen } = useUIStore();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Avoid hydration mismatch: persisted collapse state only applies after mount.
  const collapsed = mounted ? sidebarCollapsed : false;

  return (
    <div className="relative flex h-screen overflow-hidden bg-aurora">
      <aside
        className={cn(
          'hidden shrink-0 border-r border-border-subtle transition-[width] duration-200 ease-out lg:block',
          collapsed ? 'w-[76px]' : 'w-[264px]',
        )}
      >
        <SidebarContent collapsed={collapsed} />
      </aside>

      {mounted && mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-anthracite-950/70 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute left-0 top-0 h-full w-[272px] border-r border-border-subtle shadow-[var(--shadow-lifted)] animate-rise">
            <SidebarContent collapsed={false} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="relative flex-1 overflow-y-auto">
          <div aria-hidden className="pointer-events-none absolute inset-0 z-0 bg-grid opacity-40 [mask-image:linear-gradient(to_bottom,black,transparent_60%)]" />
          <div className="relative z-10 mx-auto max-w-[1600px] px-4 py-6 lg:px-8">{children}</div>
        </main>
      </div>

      <CommandPalette />
    </div>
  );
}
