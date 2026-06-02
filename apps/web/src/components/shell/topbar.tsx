'use client';

import { Bell, ChevronRight, LogOut, Menu, Search, Settings, User } from 'lucide-react';
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
    <header className="sticky top-0 z-30 flex h-[var(--spacing-topbar)] items-center gap-3 border-b border-border-subtle bg-[color-mix(in_srgb,var(--surface-1)_80%,transparent)] px-4 backdrop-blur-xl lg:px-6">
      <button
        onClick={() => setMobileOpen(true)}
        className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground lg:hidden ring-gold-focus"
        aria-label="Open menu"
      >
        <Menu className="size-5" />
      </button>

      <nav className="hidden items-center gap-1.5 text-sm sm:flex" aria-label="Breadcrumb">
        <span className="text-muted-foreground">{match?.group.label ?? 'Chista'}</span>
        {match && (
          <>
            <ChevronRight className="size-3.5 text-muted-foreground/50" />
            <span className="font-medium text-foreground">{match.item.label}</span>
          </>
        )}
      </nav>

      <button
        onClick={() => setCommandOpen(true)}
        className="group ml-auto flex h-9 items-center gap-2 rounded-md border border-border-subtle bg-[var(--surface-1)] px-3 text-sm text-muted-foreground transition-colors hover:border-border hover:text-foreground sm:w-64 ring-gold-focus"
      >
        <Search className="size-4" />
        <span className="hidden sm:inline">Search…</span>
        <kbd className="ml-auto hidden rounded border border-border-subtle bg-secondary px-1.5 py-0.5 text-[10px] sm:inline-flex">
          ⌘K
        </kbd>
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Notifications" className="relative">
            <Bell className="size-4" />
            <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-gold-500" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80">
          <DropdownMenuLabel>Notifications</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <div className="px-2.5 py-1.5 text-sm">
            <NotificationRow text="Agent us-east-agent-02 reported unhealthy" at="8m ago" tone="warn" />
            <NotificationRow text="CPU on homelab-agent-01 exceeded 85%" at="22m ago" tone="warn" />
            <NotificationRow text="License renewed — 25 concurrent seats" at="2h ago" tone="ok" />
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      <ThemeToggle />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2 rounded-full ring-gold-focus" aria-label="Account">
            <Avatar className="size-8">
              <AvatarFallback>SN</AvatarFallback>
            </Avatar>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <div className="px-2.5 py-2">
            <p className="text-sm font-medium">Administrator</p>
            <p className="text-xs text-muted-foreground">Chista Admin</p>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => router.push('/settings/general')}>
            <Settings /> Settings
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => router.push('/users')}>
            <User /> Profile
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem destructive onSelect={() => router.push('/login')}>
            <LogOut /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}

function NotificationRow({ text, at, tone }: { text: string; at: string; tone: 'ok' | 'warn' }) {
  return (
    <div className="flex items-start gap-2.5 rounded-md px-1.5 py-2 hover:bg-secondary/60">
      <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${tone === 'warn' ? 'bg-warning' : 'bg-success'}`} />
      <div className="min-w-0">
        <p className="text-sm leading-snug text-foreground">{text}</p>
        <p className="text-xs text-muted-foreground">{at}</p>
      </div>
    </div>
  );
}
