'use client';

import { ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { useAuth } from '@/lib/api/auth-context';
import { canAccessAdmin, visibleNavGroups } from '@/lib/nav';
import { cn } from '@/lib/utils';

// The launcher itself is not a tool to jump to — we are already on it.
const SKIP = new Set(['workstation']);

/**
 * Quick-launch tiles for the admin areas THIS user may open — one per nav item
 * their role grants (Live monitoring, Users, Servers, …), each with its own icon
 * and a click straight to the page. Hidden entirely for a user with no admin
 * access, so a regular launcher is untouched; a limited admin (Operator) sees
 * only their few tools, a full admin sees them all. The same permission source
 * the sidebar uses, so the two can never disagree about what a role may reach.
 *
 * It matters most on the chrome-free end-user portal (`/`), where there is no
 * sidebar: without this an admin who lands there has no way through to the admin
 * app at all.
 */
export function AdminToolsShelf() {
  const { user } = useAuth();
  const t = useTranslations('portal.adminTools');
  const tNav = useTranslations('shell.nav');
  const router = useRouter();

  const items = useMemo(
    () =>
      visibleNavGroups(user?.permissions, user?.isSystemAdmin ?? false)
        .flatMap((g) => g.items)
        .filter((i) => !SKIP.has(i.key)),
    [user?.permissions, user?.isSystemAdmin],
  );

  if (!canAccessAdmin(user?.permissions, user?.isSystemAdmin ?? false) || items.length === 0) return null;

  return (
    <section aria-label={t('title')}>
      <div className="mb-4 flex items-center gap-2">
        <ShieldCheck className="size-[18px] text-gold-300" />
        <h2 className="font-display text-xl font-semibold tracking-tight">{t('title')}</h2>
        <span className="text-xs text-muted-foreground">({items.length})</span>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8">
        {items.map((item) => {
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
                <Icon className="size-5" />
              </span>
              <span className="line-clamp-2 text-[11px] font-medium leading-tight text-foreground/90">
                {tNav(`items.${item.key}`)}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
