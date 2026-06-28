'use client';

import { LayoutGrid } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { categoryVisual } from '@/lib/workspace-visuals';
import { cn } from '@/lib/utils';

export interface CategoryCount {
  name: string;
  count: number;
}

/**
 * Left-hand category filter for the launcher — mirrors Kasm's workspace sidebar.
 * "All Workspaces" sits on top, then every category with a live count and its
 * colour-coded glyph. The active filter is lit in gold.
 */
export function CategoryRail({
  categories,
  total,
  active,
  onSelect,
  className,
}: {
  categories: CategoryCount[];
  total: number;
  active: string | null;
  onSelect: (category: string | null) => void;
  className?: string;
}) {
  const t = useTranslations('portal');

  return (
    <nav className={cn('flex flex-col gap-1', className)} aria-label={t('launcher.categoriesNavAria')}>
      <RailItem
        label={t('launcher.allWorkspaces')}
        count={total}
        active={active === null}
        onClick={() => onSelect(null)}
        icon={<LayoutGrid className="size-4" />}
      />

      <div className="my-2 px-3">
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/50">
          {t('launcher.categories')}
        </span>
      </div>

      {categories.map((cat) => {
        const { Icon, accent } = categoryVisual(cat.name);
        return (
          <RailItem
            key={cat.name}
            label={cat.name}
            count={cat.count}
            active={active === cat.name}
            onClick={() => onSelect(cat.name)}
            icon={<Icon className="size-4" style={{ color: accent }} />}
          />
        );
      })}
    </nav>
  );
}

function RailItem({
  label,
  count,
  active,
  onClick,
  icon,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-150 ring-gold-focus',
        active
          ? 'bg-[var(--surface-2)] font-medium text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]'
          : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground',
      )}
    >
      {active && (
        <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-gradient-to-b from-gold-300 to-gold-600" />
      )}
      <span className={cn('shrink-0 transition-colors', !active && 'opacity-80 group-hover:opacity-100')}>
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate text-start">{label}</span>
      <span
        className={cn(
          'shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-medium tabular-nums',
          active ? 'bg-gold-500/15 text-gold-300' : 'bg-secondary text-muted-foreground/70',
        )}
      >
        {count}
      </span>
    </button>
  );
}
