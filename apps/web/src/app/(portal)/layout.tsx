import { LayoutDashboard } from 'lucide-react';
import Link from 'next/link';
import { Logo } from '@/components/brand/logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 flex h-[var(--spacing-topbar)] items-center gap-4 border-b border-border-subtle bg-[color-mix(in_srgb,var(--surface-1)_80%,transparent)] px-4 backdrop-blur-xl lg:px-8">
        <Link href="/" className="flex items-center">
          <Logo />
        </Link>
        <nav className="ml-6 hidden items-center gap-1 text-sm sm:flex">
          <Link href="/" className="rounded-md px-3 py-1.5 font-medium text-foreground">
            My Workspaces
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/dashboard">
              <LayoutDashboard className="size-4" /> Admin
            </Link>
          </Button>
          <ThemeToggle />
          <Avatar className="size-8">
            <AvatarFallback>SN</AvatarFallback>
          </Avatar>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
