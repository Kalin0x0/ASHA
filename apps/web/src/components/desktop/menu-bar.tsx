'use client';

import { LayoutDashboard, LogOut } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AshaMark } from '@/components/brand/logo';
import { BackgroundPicker } from '@/components/composite/background-picker';
import { InstallButton } from '@/components/composite/install-button';
import { LanguageSwitcher } from '@/components/composite/language-switcher';
import { ThemeToggle } from '@/components/theme-toggle';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/lib/api/auth-context';

/**
 * The OS-style menu bar of the end-user desktop — a thin, translucent strip
 * (macOS-like) with the Asha "system menu" at the start and status items
 * (install, wallpaper, language, theme, user, live clock) at the end.
 */
export function MenuBar() {
  const t = useTranslations('portal');
  const { user, logout } = useAuth();
  const router = useRouter();

  const displayName = user?.displayName || user?.username || user?.email || 'Asha';
  const initials =
    displayName
      .split(/[\s@._-]+/)
      .filter(Boolean)
      .map((w) => w[0]!)
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'A';

  return (
    <header className="sticky top-0 z-30 flex h-[var(--spacing-topbar)] items-center gap-1 border-b border-border-subtle glass-rail px-2.5 shadow-[0_1px_0_var(--highlight-top)] backdrop-saturate-150 sm:px-3">
      {/* Asha system menu (the "apple menu") */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={t('desktop.menubar.systemMenu')}
            className="flex h-7 items-center gap-2 rounded-md px-1.5 transition-colors hover:bg-secondary/70 ring-gold-focus"
          >
            <AshaMark className="size-5" />
            <span className="hidden font-display text-[13px] font-semibold tracking-tight sm:inline">Asha</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel>
            <span className="block text-sm font-semibold leading-tight">{displayName}</span>
            {user?.email && <span className="mt-0.5 block text-xs font-normal text-muted-foreground">{user.email}</span>}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {user?.isSystemAdmin && (
            <DropdownMenuItem onSelect={() => router.push('/dashboard')}>
              <LayoutDashboard className="size-4" /> {t('header.admin')}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem destructive onSelect={() => void logout()}>
            <LogOut className="size-4" /> {t('desktop.menubar.signOut')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Active-app label, macOS style: bold app name next to the mark */}
      <span className="ms-1.5 hidden text-[13px] font-semibold text-foreground/90 md:inline">
        {t('header.myWorkspaces')}
      </span>

      {/* Status items */}
      <div className="ms-auto flex items-center gap-0.5">
        <InstallButton className="hidden md:inline-flex" />
        {user?.isSystemAdmin && (
          <Link
            href="/dashboard"
            title={t('header.admin')}
            aria-label={t('header.admin')}
            className="hidden size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground ring-gold-focus sm:inline-flex"
          >
            <LayoutDashboard className="size-4" />
          </Link>
        )}
        <BackgroundPicker />
        <LanguageSwitcher />
        <ThemeToggle />
        <Avatar className="ms-1 size-6">
          <AvatarFallback className="text-[10px] font-bold">{initials}</AvatarFallback>
        </Avatar>
        <MenuClock />
      </div>
    </header>
  );
}

/** Live, locale-formatted clock (fa gets the Persian calendar via Intl). */
function MenuClock() {
  const locale = useLocale();
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = setInterval(tick, 15_000);
    return () => clearInterval(id);
  }, []);

  // Render a fixed-width placeholder pre-mount to avoid a hydration mismatch.
  if (!now) return <span className="ms-2 inline-block w-24" aria-hidden />;

  const date = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short' }).format(now);
  const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(now);

  return (
    <span className="ms-2 hidden whitespace-nowrap text-xs font-medium tabular-nums text-foreground/85 sm:inline">
      {date}
      <span className="ms-2">{time}</span>
    </span>
  );
}
