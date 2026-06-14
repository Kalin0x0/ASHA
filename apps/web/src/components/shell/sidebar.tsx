'use client';

import { ChevronDown, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Logo } from '@/components/brand/logo';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { findNavItem, navGroups, type NavGroup, type NavItem } from '@/lib/nav';
import { useUIStore } from '@/lib/ui-store';
import { cn } from '@/lib/utils';

export function SidebarContent({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = findNavItem(pathname);
  const activeHref = active?.item.href;
  const activeGroupKey = active?.group.key;
  const { toggleSidebar, setSidebarCollapsed } = useUIStore();
  const tNav = useTranslations('shell.nav');
  const tSidebar = useTranslations('shell.sidebar');

  // Which accordion sections are open. The group holding the current route is
  // opened on load and kept open as you navigate; the user may open others too.
  const [openGroups, setOpenGroups] = useState<string[]>(() => (activeGroupKey ? [activeGroupKey] : []));
  useEffect(() => {
    if (activeGroupKey) {
      setOpenGroups((prev) => (prev.includes(activeGroupKey) ? prev : [...prev, activeGroupKey]));
    }
  }, [activeGroupKey]);

  const toggleGroup = (key: string) =>
    setOpenGroups((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  // From the collapsed rail, clicking a category opens it and expands the sidebar.
  const activateFromRail = (key: string) => {
    setOpenGroups((prev) => (prev.includes(key) ? prev : [...prev, key]));
    setSidebarCollapsed(false);
  };

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
            className="ms-auto hidden rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground lg:block ring-gold-focus"
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
        <nav className={cn('flex flex-col', collapsed ? 'gap-1.5' : 'gap-0.5')}>
          {navGroups.map((group) =>
            collapsed ? (
              <CollapsedGroup
                key={group.key}
                group={group}
                activeHref={activeHref}
                activeGroupKey={activeGroupKey}
                onActivate={activateFromRail}
                onNavigate={onNavigate}
              />
            ) : (
              <ExpandedGroup
                key={group.key}
                group={group}
                activeHref={activeHref}
                activeGroupKey={activeGroupKey}
                open={openGroups.includes(group.key)}
                onToggle={() => toggleGroup(group.key)}
                onNavigate={onNavigate}
              />
            ),
          )}
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

/* ── Expanded: a collapsible category with its pages nested beneath ────────── */
function ExpandedGroup({
  group,
  activeHref,
  activeGroupKey,
  open,
  onToggle,
  onNavigate,
}: {
  group: NavGroup;
  activeHref?: string;
  activeGroupKey?: string;
  open: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
}) {
  const tNav = useTranslations('shell.nav');
  const groupActive = group.key === activeGroupKey;

  // A single-page category (e.g. Overview → Dashboard) renders as a direct
  // top-level link — collapsing a one-row section would be pointless.
  if (group.items.length === 1) {
    const item = group.items[0]!;
    return <ItemLink item={item} label={tNav(`items.${item.key}`)} active={item.href === activeHref} onNavigate={onNavigate} />;
  }

  const GroupIcon = group.icon;
  return (
    <div className="py-px">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={cn(
          'group/h flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-start transition-colors ring-gold-focus',
          groupActive ? 'text-foreground' : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground',
        )}
      >
        <GroupIcon
          className={cn(
            'size-[18px] shrink-0 transition-colors',
            groupActive ? 'text-gold-300' : 'text-muted-foreground/70 group-hover/h:text-muted-foreground',
          )}
        />
        <span className="flex-1 truncate text-sm font-medium">{tNav(`groups.${group.key}`)}</span>
        {/* Gold dot when the current page lives inside a collapsed category */}
        {groupActive && !open && (
          <span className="size-1.5 rounded-full bg-gold-400 shadow-[0_0_6px_rgba(212,175,55,0.6)]" />
        )}
        <ChevronDown
          className={cn(
            'size-4 shrink-0 text-muted-foreground/50 transition-transform duration-200',
            open ? 'rotate-0' : '-rotate-90 rtl:rotate-90',
          )}
        />
      </button>

      {/* Collapsible body — the grid-rows trick animates height smoothly */}
      <div
        className={cn(
          'grid transition-[grid-template-rows] duration-200 ease-out',
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div className="overflow-hidden">
          <div className="ms-[1.15rem] mt-0.5 flex flex-col gap-0.5 border-s border-border-subtle ps-2">
            {group.items.map((item) => (
              <ItemLink
                key={item.href}
                item={item}
                label={tNav(`items.${item.key}`)}
                active={item.href === activeHref}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── A single page link (top-level or nested) ─────────────────────────────── */
function ItemLink({
  item,
  label,
  active,
  onNavigate,
}: {
  item: NavItem;
  label: string;
  active: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group/i relative flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ring-gold-focus',
        active
          ? 'bg-gold-500/[0.1] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
          : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground hover:translate-x-0.5',
      )}
    >
      {active && (
        <span className="absolute inset-y-1.5 start-0 w-[3px] rounded-full bg-gradient-to-b from-gold-300 to-gold-600 shadow-[0_0_10px_rgba(212,175,55,0.5)]" />
      )}
      <Icon
        className={cn(
          'size-4 shrink-0 transition-colors',
          active ? 'text-gold-300' : 'text-muted-foreground/70 group-hover/i:text-muted-foreground',
        )}
      />
      <span className={cn('truncate', active && 'font-medium')}>{label}</span>
    </Link>
  );
}

/* ── Collapsed rail: one glyph per category; click opens it + expands ──────── */
function CollapsedGroup({
  group,
  activeHref,
  activeGroupKey,
  onActivate,
  onNavigate,
}: {
  group: NavGroup;
  activeHref?: string;
  activeGroupKey?: string;
  onActivate: (key: string) => void;
  onNavigate?: () => void;
}) {
  const tNav = useTranslations('shell.nav');

  const railClass = (isActive: boolean) =>
    cn(
      'relative flex w-full items-center justify-center rounded-lg py-2.5 transition-colors ring-gold-focus',
      isActive ? 'bg-gold-500/[0.1] text-gold-300' : 'text-muted-foreground/70 hover:bg-secondary/60 hover:text-foreground',
    );
  const activeRail = (
    <span className="absolute inset-y-1.5 start-0 w-[3px] rounded-full bg-gradient-to-b from-gold-300 to-gold-600 shadow-[0_0_10px_rgba(212,175,55,0.5)]" />
  );

  // Single-page category → a direct icon link.
  if (group.items.length === 1) {
    const item = group.items[0]!;
    const isActive = item.href === activeHref;
    const Icon = item.icon;
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Link href={item.href} onClick={onNavigate} aria-current={isActive ? 'page' : undefined} className={railClass(isActive)}>
            {isActive && activeRail}
            <Icon className="size-[18px]" />
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right">{tNav(`items.${item.key}`)}</TooltipContent>
      </Tooltip>
    );
  }

  const groupActive = group.key === activeGroupKey;
  const GroupIcon = group.icon;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" onClick={() => onActivate(group.key)} aria-label={tNav(`groups.${group.key}`)} className={railClass(groupActive)}>
          {groupActive && activeRail}
          <GroupIcon className="size-[18px]" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{tNav(`groups.${group.key}`)}</TooltipContent>
    </Tooltip>
  );
}
