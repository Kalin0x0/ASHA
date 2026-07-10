'use client';

import {
  Ban,
  CalendarClock,
  Infinity as InfinityIcon,
  Loader2,
  MoreVertical,
  Plus,
  RotateCcw,
  Search,
  Shield,
  UserCheck,
  UserPlus,
  Users as UsersIcon,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/composite/empty-state';
import { Monogram } from '@/components/composite/monogram';
import { PageHeader } from '@/components/composite/page-header';
import { StatCard } from '@/components/composite/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useConfirm } from '@/components/ui/confirm';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input, Label } from '@/components/ui/input';
import { useCreateUser, useUpdateUser, useUsers } from '@/lib/hooks';
import type { UserRow } from '@/lib/types';
import { cn } from '@/lib/utils';

const STATUS_VARIANT: Record<UserRow['status'], 'success' | 'outline' | 'info' | 'destructive'> = {
  ACTIVE: 'success',
  DISABLED: 'outline',
  INVITED: 'info',
  LOCKED: 'destructive',
};

// License presets → an absolute expiry, computed from "now" at submit time.
type LicensePreset = 'unlimited' | 'h1' | 'd1' | 'w1' | 'm1' | 'custom';
const PRESET_ORDER: LicensePreset[] = ['unlimited', 'h1', 'd1', 'w1', 'm1', 'custom'];

/** Resolve a preset (+ optional custom `datetime-local` value) to an ISO expiry or null (perpetual). */
function computeDeactivatesAt(preset: LicensePreset, custom: string): string | null {
  const now = Date.now();
  switch (preset) {
    case 'unlimited':
      return null;
    case 'h1':
      return new Date(now + 3_600_000).toISOString();
    case 'd1':
      return new Date(now + 86_400_000).toISOString();
    case 'w1':
      return new Date(now + 7 * 86_400_000).toISOString();
    case 'm1': {
      const d = new Date();
      const day = d.getDate();
      d.setMonth(d.getMonth() + 1);
      // Clamp the end-of-month overflow (e.g. Jan 31 + 1mo would roll to Mar 3);
      // setDate(0) snaps back to the last day of the intended month.
      if (d.getDate() < day) d.setDate(0);
      return d.toISOString();
    }
    case 'custom':
      return custom ? new Date(custom).toISOString() : null;
  }
}

/** Locale-aware "in 3 days" / "2 hours ago" — no per-string i18n needed. */
function formatRelative(iso: string, locale: string, now: number): string {
  const ms = new Date(iso).getTime() - now;
  const abs = Math.abs(ms);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (abs >= 86_400_000) return rtf.format(Math.round(ms / 86_400_000), 'day');
  if (abs >= 3_600_000) return rtf.format(Math.round(ms / 3_600_000), 'hour');
  return rtf.format(Math.round(ms / 60_000), 'minute');
}

/** Re-render on an interval so the countdown + expiry pills stay live. */
function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function formatDate(iso: string | null, locale: string, never: string): string {
  if (!iso) return never;
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * Segmented license-duration picker used by both the create and renew dialogs.
 * Controlled: the parent owns `preset`/`custom` and computes the ISO at submit.
 */
function LicenseField({
  preset,
  custom,
  onChange,
  idPrefix,
}: {
  preset: LicensePreset;
  custom: string;
  onChange: (preset: LicensePreset, custom: string) => void;
  idPrefix: string;
}) {
  const t = useTranslations('access');
  return (
    <div>
      <Label htmlFor={`${idPrefix}-license`} className="flex items-center gap-1.5">
        <CalendarClock className="size-3.5 text-gold-300" /> {t('users.license.presetLabel')}
      </Label>
      <div id={`${idPrefix}-license`} role="radiogroup" className="mt-1.5 flex flex-wrap gap-1.5">
        {PRESET_ORDER.map((p) => {
          const selected = preset === p;
          return (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(p, custom)}
              className={cn(
                'rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors duration-150 ring-gold-focus',
                selected
                  ? 'border-[rgba(212,175,55,0.5)] bg-gold-500/15 text-gold-200'
                  : 'border-border-subtle text-muted-foreground hover:border-[rgba(212,175,55,0.35)] hover:text-foreground',
              )}
            >
              {t(`users.license.presets.${p}`)}
            </button>
          );
        })}
      </div>
      {preset === 'custom' && (
        <Input
          type="datetime-local"
          dir="ltr"
          aria-label={t('users.license.presets.custom')}
          value={custom}
          onChange={(e) => onChange('custom', e.target.value)}
          className="mt-2"
        />
      )}
      <p className="mt-1.5 text-[11px] text-muted-foreground">{t('users.license.hint')}</p>
    </div>
  );
}

/** The "License / expiry" table cell: state pill + live relative countdown. */
function LicenseCell({ deactivatesAt, locale, now }: { deactivatesAt: string | null; locale: string; now: number }) {
  const t = useTranslations('access');
  if (!deactivatesAt) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <InfinityIcon className="size-3.5" /> {t('users.license.unlimited')}
      </span>
    );
  }
  const ms = new Date(deactivatesAt).getTime() - now;
  const expired = ms <= 0;
  const soon = !expired && ms < 86_400_000;
  const variant = expired ? 'destructive' : soon ? 'warning' : 'success';
  const label = expired ? t('users.license.expired') : soon ? t('users.license.expiringSoon') : t('users.license.valid');
  return (
    <div className="flex flex-col items-start gap-1">
      <Badge variant={variant}>{label}</Badge>
      <span className="text-[11px] tabular-nums text-muted-foreground">{formatRelative(deactivatesAt, locale, now)}</span>
    </div>
  );
}

export default function UsersPage() {
  const t = useTranslations('access');
  const tc = useTranslations('common');
  const locale = useLocale();
  const now = useNow();
  const confirm = useConfirm();
  const users = useUsers();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const blankForm = {
    email: '',
    username: '',
    displayName: '',
    password: '',
    isSystemAdmin: false,
    licensePreset: 'unlimited' as LicensePreset,
    licenseCustom: '',
  };
  const [form, setForm] = useState(blankForm);
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  // Renew dialog state (per-user license extension).
  const [renewFor, setRenewFor] = useState<UserRow | null>(null);
  const [renewPreset, setRenewPreset] = useState<LicensePreset>('m1');
  const [renewCustom, setRenewCustom] = useState('');
  const [renewing, setRenewing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = form.email.trim();
    if (!email) {
      toast.error(t('users.create.emailRequired'));
      return;
    }
    if (form.licensePreset === 'custom' && !form.licenseCustom) {
      toast.error(t('users.license.customRequired'));
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
        deactivatesAt: computeDeactivatesAt(form.licensePreset, form.licenseCustom),
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

  const openRenew = (u: UserRow) => {
    setRenewFor(u);
    setRenewPreset('m1');
    setRenewCustom('');
  };

  const onRenew = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renewFor) return;
    if (renewPreset === 'custom' && !renewCustom) {
      toast.error(t('users.license.customRequired'));
      return;
    }
    setRenewing(true);
    try {
      // Renew = new expiry, and reactivate ONLY a license-disabled account. Never
      // flip a LOCKED (security lockout) or INVITED account to ACTIVE as a side
      // effect of extending a license.
      await updateUser(renewFor.id, {
        deactivatesAt: computeDeactivatesAt(renewPreset, renewCustom),
        ...(renewFor.status === 'DISABLED' ? { status: 'ACTIVE' as const } : {}),
      });
      toast.success(t('users.toasts.renewed', { email: renewFor.email }));
      setRenewFor(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('users.toasts.updateFailed'));
    } finally {
      setRenewing(false);
    }
  };

  const onDeactivateNow = async (u: UserRow) => {
    const ok = await confirm({
      title: t('users.license.deactivateNow'),
      description: t('users.license.deactivateConfirm', { name: u.name }),
      confirmLabel: t('users.license.deactivateNow'),
      destructive: true,
    });
    if (!ok) return;
    setBusyId(u.id);
    try {
      // Set the expiry to "now": the license-reaper then tears down live sessions
      // + revokes tokens and flips the account to DISABLED within a tick, and the
      // login gate blocks it immediately.
      await updateUser(u.id, { deactivatesAt: new Date().toISOString() });
      toast.success(t('users.toasts.deactivated', { email: u.email }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('users.toasts.updateFailed'));
    } finally {
      setBusyId(null);
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
                <th className="px-5 py-3 font-medium">{t('users.table.license')}</th>
                <th className="px-5 py-3 font-medium">{t('users.table.groups')}</th>
                <th className="px-5 py-3 font-medium">{t('users.table.twoFactor')}</th>
                <th className="px-5 py-3 font-medium">{t('users.table.lastLogin')}</th>
                <th className="px-5 py-3 font-medium">
                  <span className="sr-only">{tc('labels.actions')}</span>
                </th>
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
                    {u.isSystemAdmin ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : (
                      <LicenseCell deactivatesAt={u.deactivatesAt} locale={locale} now={now} />
                    )}
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
                  <td className="px-5 py-3 text-end">
                    {u.isSystemAdmin ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={tc('labels.actions')}
                          disabled={busyId === u.id}
                          className="opacity-60 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                        >
                          {busyId === u.id ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <MoreVertical className="size-4" />
                          )}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-52">
                        <DropdownMenuItem onSelect={() => openRenew(u)}>
                          <RotateCcw className="size-4 text-gold-300" /> {t('users.license.renew')}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onSelect={() => void onDeactivateNow(u)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Ban className="size-4" /> {t('users.license.deactivateNow')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7}>
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

      {/* Create user */}
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
                placeholder="jane@asha.local"
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

            <LicenseField
              idPrefix="nu"
              preset={form.licensePreset}
              custom={form.licenseCustom}
              onChange={(licensePreset, licenseCustom) => set({ licensePreset, licenseCustom })}
            />

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

      {/* Renew license */}
      <Dialog open={renewFor !== null} onOpenChange={(o) => !o && setRenewFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="size-5 text-gold-300" /> {t('users.license.renewTitle')}
            </DialogTitle>
            <DialogDescription>
              {renewFor ? t('users.license.renewDescription', { name: renewFor.name }) : ''}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onRenew} className="space-y-3">
            <LicenseField
              idPrefix="renew"
              preset={renewPreset}
              custom={renewCustom}
              onChange={(p, c) => {
                setRenewPreset(p);
                setRenewCustom(c);
              }}
            />
            <DialogFooter>
              <Button type="button" variant="ghost" size="sm" onClick={() => setRenewFor(null)}>
                {tc('actions.cancel')}
              </Button>
              <Button type="submit" size="sm" disabled={renewing}>
                {renewing ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
                {t('users.license.renewSubmit')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
