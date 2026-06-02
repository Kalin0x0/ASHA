'use client';

import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo } from '@/components/brand/logo';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { findNavItem, navGroups } from '@/lib/nav';
import { useUIStore } from '@/lib/ui-store';
import { cn } from '@/lib/utils';

export function SidebarContent({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const activeHref = findNavItem(pathname)?.item.href;
  const { toggleSidebar } = useUIStore();

  return (
    <div className="flex h-full flex-col bg-[var(--surface-1)]">
      <div className={cn('flex h-[var(--spacing-topbar)] items-center border-b border-border-subtle px-4', collapsed && 'justify-center px-0')}>
        <Link href="/dashboard" onClick={onNavigate} className="flex items-center">
          <Logo collapsed={collapsed} />
        </Link>
        {!collapsed && (
          <button
            onClick={toggleSidebar}
            className="ml-auto hidden rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground lg:block ring-gold-focus"
            aria-label="Collapse sidebar"
          >
            <PanelLeftClose className="size-4" />
          </button>
        )}
      </div>

      {collapsed && (
        <button
          onClick={toggleSidebar}
          className="mx-auto mt-2 hidden rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground lg:block ring-gold-focus"
          aria-label="Expand sidebar"
        >
          <PanelLeftOpen className="size-4" />
        </button>
      )}

      <ScrollArea className="flex-1 px-3 py-3">
        <nav className="flex flex-col gap-5">
          {navGroups.map((group) => (
            <div key={group.label} className="flex flex-col gap-1">
              {!collapsed && (
                <span className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                  {group.label}
                </span>
              )}
              {group.items.map((item) => {
                const active = item.href === activeHref;
                const link = (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(
                      'group relative flex items-center gap-3 rounded-md px-2.5 py-2 text-sm transition-colors ring-gold-focus',
                      collapsed && 'justify-center px-0',
                      active
                        ? 'bg-secondary text-foreground'
                        : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
                    )}
                  >
                    {active && (
                      <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-gradient-to-b from-gold-400 to-gold-600" />
                    )}
                    <item.icon className={cn('size-4 shrink-0', active && 'text-gold-300')} />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </Link>
                );

                return collapsed ? (
                  <Tooltip key={item.href}>
                    <TooltipTrigger asChild>{link}</TooltipTrigger>
                    <TooltipContent side="right">{item.label}</TooltipContent>
                  </Tooltip>
                ) : (
                  link
                );
              })}
            </div>
          ))}
        </nav>
      </ScrollArea>

      {!collapsed && (
        <div className="border-t border-border-subtle px-4 py-3">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-success animate-pulse-ring" />
              All systems operational
            </span>
            <span className="text-muted-foreground/60">Chista</span>
          </div>
        </div>
      )}
    </div>
  );
}
