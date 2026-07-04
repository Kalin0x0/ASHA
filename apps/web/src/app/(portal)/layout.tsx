'use client';

import { AuthGate } from '@/components/auth-gate';
import { FeedbackWidget } from '@/components/composite/feedback-widget';
import { MockThumbnailSeeder } from '@/components/composite/mock-thumbnail-seeder';
import { MenuBar } from '@/components/desktop/menu-bar';
import { AppBackground } from '@/components/decor/app-background';

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    // The portal is an OS desktop: a thin macOS-style menu bar instead of the
    // 60px admin topbar. The local --spacing-topbar override keeps every
    // descendant height calc (viewer pages, sticky offsets) in sync with it.
    <div className="relative flex min-h-screen flex-col" style={{ ['--spacing-topbar' as string]: '38px' }}>
      <AppBackground />
      {/* Chrome lives OUTSIDE <AuthGate> so the way back to the admin area is
          always rendered — never hidden behind a transient auth-loading frame. */}
      <MenuBar />
      <AuthGate>
        <MockThumbnailSeeder />
        <main className="relative z-10 flex-1">{children}</main>
        <FeedbackWidget />
      </AuthGate>
    </div>
  );
}
