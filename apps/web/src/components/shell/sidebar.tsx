'use client';

import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
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
  const tNav = useTranslations('shell.nav');
  const tSidebar = useTranslations('shell.sidebar');

  return (
    <div className="flex h-full flex-col glass-rail">
      {/* Logo strip */}
      <div
        className={cn(
          'flex h-[var(--spacing-topbar)] items-center border-b border-border-subtle',
          collapsed ? 'justify-center px-0' : 'px-4',
        )}
      >
        <Link href="/dashboard" onClick={onNavigate} className="flex items-center ring-gold-focus rounded-md">
          <Logo collapsed={collapsed} />
        </Link>
        {!collapsed && (
          <button
            onClick={toggleSidebar}
            className="ml-auto hidden rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground lg:block ring-gold-focus"
            aria-label={tSidebar('collapse')}
          >
            <PanelLeftClose className="size-4" />
          </button>
        )}
      </div>

      {/* Collapsed expand button */}
      {collapsed && (
        <button
          onClick={toggleSidebar}
          className="mx-auto mt-2 hidden rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground lg:block ring-gold-focus"
          aria-label={tSidebar('expand')}
        >
          <PanelLeftOpen className="size-4" />
        </button>
      )}

      <ScrollArea className="flex-1 px-2.5 py-3">
        <nav className="flex flex-col gap-5">
          {navGroups.map((group) => (
            <div key={group.key} className="flex flex-col gap-0.5">
              {!collapsed && (
                <span className="px-2.5 pb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/50">
                  {tNav(`groups.${group.key}`)}
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
                      'group relative flex items-center gap-3 rounded-lg text-sm transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ring-gold-focus',
                      collapsed ? 'justify-center px-0 py-2.5' : 'px-2.5 py-2',
                      active
                        ? 'bg-gold-500/[0.1] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
                        : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground hover:translate-x-0.5',
                    )}
                  >
                    {/* Active indicator bar — glowing gold rail */}
                    {active && (
                      <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-gradient-to-b from-gold-300 to-gold-600 shadow-[0_0_10px_rgba(212,175,55,0.5)]" />
                    )}
                    {/* Icon */}
                    <item.icon
                      className={cn(
                        'size-4 shrink-0 transition-colors',
                        active ? 'text-gold-300' : 'text-muted-foreground/70 group-hover:text-muted-foreground',
                      )}
                    />
                    {!collapsed && (
                      <span className={cn('truncate text-[13px]', active && 'font-medium')}>
                        {tNav(`items.${item.key}`)}
                      </span>
                    )}
                  </Link>
                );

                return collapsed ? (
                  <Tooltip key={item.href}>
                    <TooltipTrigger asChild>{link}</TooltipTrigger>
                    <TooltipContent side="right">{tNav(`items.${item.key}`)}</TooltipContent>
                  </Tooltip>
                ) : (
                  link
                );
              })}
            </div>
          ))}
        </nav>
      </ScrollArea>

      {/* Status footer */}
      {!collapsed && (
        <div className="border-t border-border-subtle px-4 py-3">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-success animate-pulse-ring" />
              {tSidebar('allSystemsOperational')}
            </span>
            <span className="text-muted-foreground/50 font-medium">Chista</span>
          </div>
        </div>
      )}
    </div>
  );
}
