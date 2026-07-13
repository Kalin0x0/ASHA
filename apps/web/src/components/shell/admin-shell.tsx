'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { FeedbackWidget } from '@/components/composite/feedback-widget';
import { AppBackground } from '@/components/decor/app-background';
import { CommandPalette } from '@/components/shell/command-palette';
import { SidebarContent } from '@/components/shell/sidebar';
import { Topbar } from '@/components/shell/topbar';
import { useAuth } from '@/lib/api/auth-context';
import { isLive } from '@/lib/api/mode';
import { canAccessAdmin, canAccessRoute } from '@/lib/nav';
import { useUIStore } from '@/lib/ui-store';
import { cn } from '@/lib/utils';

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { sidebarCollapsed, mobileOpen, setMobileOpen } = useUIStore();
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Two-level gate:
  //  • no elevated permission at all → bounce to the portal ('/').
  //  • limited admin (e.g. Operator) who deep-links to a section outside their
  //    permitted nav → bounce to their landing dashboard.
  const gated = isLive && !!user && !user.isSystemAdmin;
  const denied = gated && !canAccessAdmin(user!.permissions, false);
  const routeDenied = gated && !denied && !canAccessRoute(pathname, user!.permissions, false);
  useEffect(() => {
    if (denied) router.replace('/');
    else if (routeDenied) router.replace('/dashboard');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [denied, routeDenied]);

  // Avoid hydration mismatch: persisted collapse state only applies after mount.
  const collapsed = mounted ? sidebarCollapsed : false;

  if (denied || routeDenied) return null;

  return (
    <div className="relative flex h-screen overflow-hidden">
      <AppBackground />
      <aside
        className={cn(
          'relative z-10 hidden shrink-0 border-e border-border-subtle transition-[width] duration-200 ease-out lg:block',
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
          <aside className="absolute start-0 top-0 h-full w-[272px] border-e border-border-subtle shadow-[var(--shadow-lifted)] animate-rise">
            <SidebarContent collapsed={false} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="relative flex-1 overflow-y-auto">
          <div aria-hidden className="pointer-events-none absolute inset-0 z-0 bg-grid opacity-40 [mask-image:linear-gradient(to_bottom,black,transparent_60%)]" />
          <div className="relative z-10 mx-auto max-w-[1600px] px-4 py-6 lg:px-8">{children}</div>
        </main>
      </div>

      <CommandPalette />
      <FeedbackWidget />
    </div>
  );
}
