'use client';

import { AuthGate } from '@/components/auth-gate';
import { FeedbackWidget } from '@/components/composite/feedback-widget';
import { MockThumbnailSeeder } from '@/components/composite/mock-thumbnail-seeder';
import { AppBackground } from '@/components/decor/app-background';

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    // The portal is a Windows-style OS desktop: no top chrome — the Desktop
    // renders its own floating taskbar + Start menu. The wallpaper sits behind
    // everything; the page body fills the viewport.
    <div className="relative flex min-h-screen flex-col">
      <AppBackground />
      <AuthGate>
        <MockThumbnailSeeder />
        <main className="relative z-10 flex-1">{children}</main>
        <FeedbackWidget />
      </AuthGate>
    </div>
  );
}
