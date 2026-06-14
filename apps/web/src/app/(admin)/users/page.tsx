'use client';

import { Loader2, Plus, Search, Shield, UserCheck, UserPlus, Users as UsersIcon } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/composite/empty-state';
import { Monogram } from '@/components/composite/monogram';
import { PageHeader } from '@/components/composite/page-header';
import { StatCard } from '@/components/composite/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, Label } from '@/components/ui/input';
import { useCreateUser, useUsers } from '@/lib/hooks';
import type { UserRow } from '@/lib/types';

const STATUS_VARIANT: Record<UserRow['status'], 'success' | 'outline' | 'info' | 'destructive'> = {
  ACTIVE: 'success',
  DISABLED: 'outline',
  INVITED: 'info',
  LOCKED: 'destructive',
};

function formatDate(iso: string | null, locale: string, never: string): string {
  if (!iso) return never;
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function UsersPage() {
  const t = useTranslations('access');
  const tc = useTranslations('common');
  const locale = useLocale();
  const users = useUsers();
  const createUser = useCreateUser();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const blankForm = { email: '', username: '', displayName: '', password: '', isSystemAdmin: false };
  const [form, setForm] = useState(blankForm);
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = form.email.trim();
    if (!email) {
      toast.error(t('users.create.emailRequired'));
      return;
    }
    setSubmitting(true);
    try {
      await createUser({
        email,
        username: form.username.trim() || undefined,
        displayName: form.displayName.trim() || undefined,
        password: form.password || undefined,
        isSystemAdmin: form.isSystemAdmin,
      });
      toast.success(t('users.toasts.created', { email }));
      setForm(blankForm);
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('users.toasts.createFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = useMemo(() => {
    if (!query) return users;
    const q = query.toLowerCase();
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q),
    );
  }, [users, query]);

  const active = users.filter((u) => u.status === 'ACTIVE').length;
  const withMfa = users.filter((u) => u.twoFactor).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('users.title')}
        description={t('users.description')}
        actions={
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="size-3.5" /> {t('users.newUser')}
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label={t('users.stats.totalUsers')} value={users.length} icon={UsersIcon} primary />
        <StatCard label={tc('labels.active')} value={active} icon={UserCheck} />
        <StatCard label={t('users.stats.withTwoFactor')} value={withMfa} icon={Shield} />
      </div>

      <div className="relative max-w-md">
        <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={t('users.searchPlaceholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-10 ps-9"
        />
      </div>

      <Card elevation={1} className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-[color-mix(in_srgb,var(--surface-2)_45%,transparent)] text-start text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                <th className="px-5 py-3 font-medium">{t('users.table.user')}</th>
                <th className="px-5 py-3 font-medium">{tc('labels.status')}</th>
                <th className="px-5 py-3 font-medium">{t('users.table.groups')}</th>
                <th className="px-5 py-3 font-medium">{t('users.table.twoFactor')}</th>
                <th className="px-5 py-3 font-medium">{t('users.table.lastLogin')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr
                  key={u.id}
                  className="group border-b border-border-subtle/60 transition-all duration-150 last:border-0 hover:bg-gold-500/[0.05] hover:shadow-[inset_2px_0_0_rgba(212,175,55,0.55)]"
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <Monogram name={u.name} className="size-9" />
                      <div className="min-w-0">
                        <p className="truncate font-medium">{u.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <Badge variant={STATUS_VARIANT[u.status]} className="capitalize">
                      {tc(`userStatus.${u.status}`)}
                    </Badge>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap gap-1">
                      {u.groups.length ? (
                        u.groups.map((g) => (
                          <Badge key={g} variant="outline">
                            {g}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    {u.twoFactor ? (
                      <Badge variant="success">{tc('labels.on')}</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">{tc('labels.off')}</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {formatDate(u.lastLoginAt, locale, tc('time.never'))}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5}>
                    <EmptyState
                      icon={UsersIcon}
                      title={t('users.empty.title')}
                      description={query ? t('users.empty.searchDescription') : t('users.empty.noUsersDescription')}
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="size-5 text-gold-300" /> {t('users.create.title')}
            </DialogTitle>
            <DialogDescription>{t('users.create.description')}</DialogDescription>
          </DialogHeader>

          <form onSubmit={onSubmit} className="space-y-3">
            <div>
              <Label htmlFor="nu-email">{t('users.create.email')}</Label>
              <Input
                id="nu-email"
                type="email"
                required
                autoFocus
                dir="ltr"
                placeholder="jane@chista.local"
                value={form.email}
                onChange={(e) => set({ email: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="nu-username">{t('users.create.username')}</Label>
                <Input id="nu-username" dir="ltr" value={form.username} onChange={(e) => set({ username: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="nu-display">{t('users.create.displayName')}</Label>
                <Input id="nu-display" value={form.displayName} onChange={(e) => set({ displayName: e.target.value })} />
              </div>
            </div>
            <p className="-mt-1 text-[11px] text-muted-foreground">{t('users.create.usernameHint')}</p>
            <div>
              <Label htmlFor="nu-pass">{t('users.create.password')}</Label>
              <Input
                id="nu-pass"
                type="password"
                dir="ltr"
                autoComplete="new-password"
                value={form.password}
                onChange={(e) => set({ password: e.target.value })}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">{t('users.create.passwordHint')}</p>
            </div>
            <label className="flex items-center gap-2.5 rounded-lg border border-border-subtle px-3 py-2.5 text-sm">
              <input
                type="checkbox"
                checked={form.isSystemAdmin}
                onChange={(e) => set({ isSystemAdmin: e.target.checked })}
                className="size-4 accent-gold-500"
              />
              <span className="inline-flex items-center gap-1.5">
                <Shield className="size-3.5 text-gold-300" /> {t('users.create.systemAdmin')}
              </span>
            </label>

            <DialogFooter>
              <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
                {tc('actions.cancel')}
              </Button>
              <Button type="submit" size="sm" disabled={submitting}>
                {submitting ? <Loader2 className="size-3.5 animate-spin" /> : <UserPlus className="size-3.5" />}
                {t('users.create.submit')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
