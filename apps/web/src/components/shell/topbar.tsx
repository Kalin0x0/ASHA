'use client';

import { AppWindow, Bell, ChevronRight, LogOut, Menu, Search, Settings, User } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { usePathname } from 'next/navigation';
import { ThemeToggle } from '@/components/theme-toggle';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { findNavItem } from '@/lib/nav';
import { useUIStore } from '@/lib/ui-store';

export function Topbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { setCommandOpen, setMobileOpen } = useUIStore();
  const match = findNavItem(pathname);

  return (
    <header className="sticky top-0 z-30 flex h-[var(--spacing-topbar)] items-center gap-3 border-b border-border-subtle bg-[color-mix(in_srgb,var(--surface-1)_82%,transparent)] px-4 shadow-[0_1px_0_var(--highlight-top),0_10px_30px_-20px_rgba(0,0,0,0.6)] backdrop-blur-xl backdrop-saturate-150 lg:px-6">
      {/* Mobile menu trigger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground lg:hidden ring-gold-focus transition-colors"
        aria-label="Open menu"
      >
        <Menu className="size-5" />
      </button>

      {/* Breadcrumb */}
      <nav className="hidden items-center gap-1.5 text-[13px] sm:flex" aria-label="Breadcrumb">
        <span className="text-muted-foreground/70 font-medium">{match?.group.label ?? 'Chista'}</span>
        {match && (
          <>
            <ChevronRight className="size-3.5 text-muted-foreground/40" />
            <span className="font-semibold text-foreground">{match.item.label}</span>
          </>
        )}
      </nav>

      {/* Search */}
      <button
        onClick={() => setCommandOpen(true)}
        className="group ml-auto flex h-9 items-center gap-2.5 rounded-lg border border-border-subtle bg-[var(--surface-2)]/60 px-3 text-[13px] text-muted-foreground transition-all duration-200 hover:border-[rgba(212,175,55,0.3)] hover:bg-[var(--surface-2)] hover:text-foreground hover:shadow-[0_0_0_1px_rgba(212,175,55,0.15)] sm:w-64 ring-gold-focus"
      >
        <Search className="size-3.5 shrink-0" />
        <span className="hidden sm:inline">Search…</span>
        <kbd className="ml-auto hidden rounded-md border border-border-subtle bg-secondary px-1.5 py-0.5 text-[10px] font-medium sm:inline-flex">
          ⌘K
        </kbd>
      </button>

      {/* Switch to the end-user Workstation */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.push('/')}
        className="hidden gap-1.5 sm:inline-flex"
      >
        <AppWindow className="size-4" /> Workstation
      </Button>

      {/* Notifications */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Notifications" className="relative">
            <Bell className="size-4" />
            <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-gold-500 ring-1 ring-[var(--surface-1)]" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80">
          <DropdownMenuLabel className="flex items-center justify-between">
            <span>Notifications</span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gold-300">3 new</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <div className="px-1.5 py-1">
            <NotificationRow text="Agent us-east-agent-02 reported unhealthy" at="8m ago" tone="warn" />
            <NotificationRow text="CPU on homelab-agent-01 exceeded 85%" at="22m ago" tone="warn" />
            <NotificationRow text="License renewed — 25 concurrent seats" at="2h ago" tone="ok" />
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      <ThemeToggle />

      {/* Account menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="flex items-center gap-2 rounded-full ring-gold-focus outline-none transition-transform hover:scale-[1.02] active:scale-[0.98]"
            aria-label="Account"
          >
            <Avatar className="size-8 ring-2 ring-border-subtle transition-all hover:ring-gold-500/40">
              <AvatarFallback className="text-[11px] font-bold bg-gradient-to-br from-gold-700 to-gold-900 text-gold-200">
                AD
              </AvatarFallback>
            </Avatar>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <div className="px-2.5 py-2.5">
            <p className="text-sm font-semibold leading-tight">Administrator</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Chista Admin</p>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => router.push('/settings/general')}>
            <Settings className="size-4" /> Settings
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => router.push('/users')}>
            <User className="size-4" /> Profile
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem destructive onSelect={() => router.push('/login')}>
            <LogOut className="size-4" /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}

function NotificationRow({ text, at, tone }: { text: string; at: string; tone: 'ok' | 'warn' }) {
  return (
    <div className="flex items-start gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-secondary/60">
      <span
        className={`mt-1.5 size-1.5 shrink-0 rounded-full ${tone === 'warn' ? 'bg-warning' : 'bg-success'}`}
      />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] leading-snug text-foreground">{text}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{at}</p>
      </div>
    </div>
  );
}
