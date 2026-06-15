'use client';

import { LayoutDashboard } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { AuthGate } from '@/components/auth-gate';
import { Logo } from '@/components/brand/logo';
import { BackgroundPicker } from '@/components/composite/background-picker';
import { FavoriteQuickLaunch } from '@/components/composite/favorite-quick-launch';
import { FeedbackWidget } from '@/components/composite/feedback-widget';
import { InstallButton } from '@/components/composite/install-button';
import { MockThumbnailSeeder } from '@/components/composite/mock-thumbnail-seeder';
import { AppBackground } from '@/components/decor/app-background';
import { ThemeToggle } from '@/components/theme-toggle';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/api/auth-context';

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations('portal');
  const { user } = useAuth();

  return (
    <AuthGate>
      <div className="relative flex min-h-screen flex-col">
        <AppBackground />
        <header className="sticky top-0 z-30 flex h-[var(--spacing-topbar)] items-center gap-4 border-b border-border-subtle glass-rail px-4 lg:px-8">
          <Link href="/" className="flex items-center ring-gold-focus rounded-md">
            <Logo />
          </Link>
          <nav className="ml-6 hidden items-center gap-1 text-sm sm:flex">
            <span className="rounded-md px-3 py-1.5 font-medium text-foreground">{t('header.myWorkspaces')}</span>
          </nav>
          <div className="ms-auto flex items-center gap-3">
            <InstallButton className="hidden sm:inline-flex" />
            <FavoriteQuickLaunch />
            {user?.isSystemAdmin && (
              <Button asChild variant="ghost" size="sm" className="gap-1.5">
                <Link href="/dashboard">
                  <LayoutDashboard className="size-4" /> {t('header.admin')}
                </Link>
              </Button>
            )}
            <BackgroundPicker />
            <ThemeToggle />
            <Avatar className="size-8">
              <AvatarFallback>SN</AvatarFallback>
            </Avatar>
          </div>
        </header>
        <MockThumbnailSeeder />
        <main className="relative z-10 flex-1">{children}</main>
        <FeedbackWidget />
      </div>
    </AuthGate>
  );
}
