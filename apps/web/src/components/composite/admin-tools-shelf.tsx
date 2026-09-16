'use client';

import { Search, ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useAuth } from '@/lib/api/auth-context';
import { adminToolGroups, canAccessAdmin } from '@/lib/nav';
import { cn } from '@/lib/utils';

/**
 * Quick-launch tiles for the admin areas THIS user may open, kept in the same
 * groups as the sidebar (Overview, Sessions, Access, Infrastructure, …) and
 * filterable by name — a flat wall of every page was too much to scan. Hidden
 * entirely for a user with no admin access; a limited admin (Operator) sees only
 * the groups and tools their role grants.
 *
 * It matters most on the chrome-free end-user portal, where there is no sidebar:
 * without this an admin who lands there has no way through to the admin app.
 */
export function AdminToolsShelf() {
  const { user } = useAuth();
  const t = useTranslations('portal.adminTools');
  const tNav = useTranslations('shell.nav');
  const router = useRouter();
  const [query, setQuery] = useState('');

  const groups = useMemo(
    () => adminToolGroups(user?.permissions, user?.isSystemAdmin ?? false),
    [user?.permissions, user?.isSystemAdmin],
  );
  const total = useMemo(() => groups.reduce((n, g) => n + g.items.length, 0), [groups]);

  // Filter on the translated tool name; a group left with no match drops out.
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((g) => ({ ...g, items: g.items.filter((i) => tNav(`items.${i.key}`).toLowerCase().includes(q)) }))
      .filter((g) => g.items.length > 0);
  }, [groups, query, tNav]);

  if (!canAccessAdmin(user?.permissions, user?.isSystemAdmin ?? false) || total === 0) return null;

  return (
    <section aria-label={t('title')}>
      <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-3">
        <ShieldCheck className="size-[18px] text-gold-300" aria-hidden />
        <h2 className="font-display text-xl font-semibold tracking-tight">{t('title')}</h2>
        <span className="text-xs text-muted-foreground">({total})</span>
        <div className="relative ms-auto w-full sm:w-64">
          <Search
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && query) {
                e.stopPropagation();
                setQuery('');
              }
            }}
            placeholder={t('searchPlaceholder')}
            aria-label={t('searchPlaceholder')}
            className="h-9 w-full rounded-lg border border-border-subtle bg-[var(--surface-1)] ps-9 pe-3 text-sm outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus-visible:border-gold-500/40 focus-visible:shadow-[var(--gold-glow)]"
          />
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-xl border border-border-subtle bg-[var(--surface-1)] px-4 py-6 text-center text-sm text-muted-foreground">
          {t('noResults')}
        </p>
      ) : (
        <div className="space-y-6">
          {shown.map((group) => {
            const GroupIcon = group.icon;
            return (
              <div key={group.key}>
                <div className="mb-2 flex items-center gap-2">
                  <GroupIcon className="size-4 text-muted-foreground" aria-hidden />
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {tNav(`groups.${group.key}`)}
                  </h3>
                </div>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.href}
                        type="button"
                        onClick={() => router.push(item.href)}
                        className={cn(
                          'group flex flex-col items-center gap-2 rounded-xl border border-border-subtle bg-[var(--surface-1)] p-3 text-center ring-gold-focus transition-colors',
                          'hover:border-gold-500/40 hover:bg-gold-500/5',
                        )}
                      >
                        <span className="grid size-10 place-items-center rounded-lg border border-border-subtle bg-[var(--surface-2)] text-gold-300 transition-colors group-hover:border-gold-500/40">
                          <Icon className="size-5" aria-hidden />
                        </span>
                        <span className="line-clamp-2 text-[11px] font-medium leading-tight text-foreground/90">
                          {tNav(`items.${item.key}`)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
