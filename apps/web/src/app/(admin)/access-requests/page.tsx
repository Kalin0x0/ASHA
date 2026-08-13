'use client';

import {
  CalendarClock,
  Check,
  Clock,
  DoorOpen,
  Inbox,
  Loader2,
  MoreHorizontal,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserPlus,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { EmptyState } from '@/components/composite/empty-state';
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
import {
  type ApiAccountRequest,
  approveAccountRequest,
  deleteAccountRequest,
  getAccountRequestSettings,
  getAccountRequests,
  rejectAccountRequest,
  setAccountRequestSettings,
} from '@/lib/api/endpoints';
import { isLive } from '@/lib/api/mode';
import { cn } from '@/lib/utils';

const STATUS_VARIANT: Record<ApiAccountRequest['status'], 'warning' | 'success' | 'outline'> = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'outline',
};

/** Demo-length presets, mirroring the user table's license picker. */
type LicensePreset = 'unlimited' | 'h1' | 'd1' | 'w1' | 'm1' | 'custom';
const PRESET_ORDER: LicensePreset[] = ['unlimited', 'h1', 'd1', 'w1', 'm1', 'custom'];

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
      if (d.getDate() < day) d.setDate(0);
      return d.toISOString();
    }
    case 'custom':
      return custom ? new Date(custom).toISOString() : null;
  }
}

type Filter = 'PENDING' | 'ALL';

export default function AccessRequestsPage() {
  const t = useTranslations('access.requests');
  const tLicense = useTranslations('access.users.license');
  const locale = useLocale();
  const confirm = useConfirm();

  const [rows, setRows] = useState<ApiAccountRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('PENDING');
  const [busyId, setBusyId] = useState<string | null>(null);
  /** Public sign-up switch. null while loading so the toggle doesn't flicker. */
  const [signupOpen, setSignupOpen] = useState<boolean | null>(null);
  const [togglingSignup, setTogglingSignup] = useState(false);

  // Approve dialog
  const [approving, setApproving] = useState<ApiAccountRequest | null>(null);
  const [preset, setPreset] = useState<LicensePreset>('w1');
  const [custom, setCustom] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!isLive) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setRows(await getAccountRequests(filter === 'PENDING' ? 'PENDING' : undefined));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('errors.load'));
    } finally {
      setLoading(false);
    }
  }, [filter, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!isLive) return;
    getAccountRequestSettings()
      .then((s) => setSignupOpen(s.enabled))
      .catch(() => setSignupOpen(false));
  }, []);

  const onToggleSignup = async () => {
    const next = !signupOpen;
    setTogglingSignup(true);
    try {
      const res = await setAccountRequestSettings(next);
      setSignupOpen(res.enabled);
      toast.success(res.enabled ? t('toggle.opened') : t('toggle.closed'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('errors.toggle'));
    } finally {
      setTogglingSignup(false);
    }
  };

  const pending = rows.filter((r) => r.status === 'PENDING').length;
  const approved = rows.filter((r) => r.status === 'APPROVED').length;
  const rejected = rows.filter((r) => r.status === 'REJECTED').length;

  const openApprove = (row: ApiAccountRequest) => {
    setApproving(row);
    setPreset('w1');
    setCustom('');
    setNote('');
  };

  const onApprove = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!approving) return;
    setSubmitting(true);
    try {
      const res = await approveAccountRequest(approving.id, {
        deactivatesAt: computeDeactivatesAt(preset, custom),
        note: note || undefined,
      });
      toast.success(t('toast.approved', { email: res.user.email }));
      setApproving(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('errors.approve'));
    } finally {
      setSubmitting(false);
    }
  };

  const onReject = async (row: ApiAccountRequest) => {
    const ok = await confirm({
      title: t('confirm.rejectTitle'),
      description: t('confirm.rejectBody', { email: row.email }),
      confirmLabel: t('actions.reject'),
      destructive: true,
    });
    if (!ok) return;
    setBusyId(row.id);
    try {
      await rejectAccountRequest(row.id);
      toast.success(t('toast.rejected'));
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('errors.reject'));
    } finally {
      setBusyId(null);
    }
  };

  const onDelete = async (row: ApiAccountRequest) => {
    const ok = await confirm({
      title: t('confirm.deleteTitle'),
      description: t('confirm.deleteBody', { email: row.email }),
      confirmLabel: t('actions.delete'),
      destructive: true,
    });
    if (!ok) return;
    setBusyId(row.id);
    try {
      await deleteAccountRequest(row.id);
      toast.success(t('toast.deleted'));
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('errors.delete'));
    } finally {
      setBusyId(null);
    }
  };

  const fmt = (iso: string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <div className="flex items-center gap-1.5 rounded-lg border border-border-subtle p-1">
            {(['PENDING', 'ALL'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                aria-pressed={filter === f}
                className={cn(
                  'ring-gold-focus rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-150',
                  filter === f
                    ? 'bg-gold-500/15 text-gold-200'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {t(`filter.${f.toLowerCase()}`)}
              </button>
            ))}
          </div>
        }
      />

      {/* Public sign-up switch — off by default, so this is how it gets opened. */}
      {isLive && (
        <Card elevation={1} className="p-4 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span
                className={cn(
                  'mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border transition-colors',
                  signupOpen
                    ? 'border-gold-500/40 bg-gold-500/[0.12] text-gold-300'
                    : 'border-border-subtle bg-[var(--surface-2)] text-muted-foreground',
                )}
              >
                <DoorOpen className="size-4" />
              </span>
              <div>
                <p className="text-sm font-medium">{t('toggle.title')}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  {signupOpen ? t('toggle.onBody') : t('toggle.offBody')}
                </p>
                {signupOpen && (
                  <p className="mt-1.5 text-[11px] text-muted-foreground/70">
                    <span className="text-muted-foreground">{t('toggle.publicUrl')}</span>{' '}
                    <code className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 font-mono" dir="ltr">
                      /request-access
                    </code>
                  </p>
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2.5">
              {togglingSignup && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
              <button
                type="button"
                role="switch"
                aria-checked={!!signupOpen}
                aria-label={signupOpen ? t('toggle.close') : t('toggle.open')}
                disabled={signupOpen === null || togglingSignup}
                onClick={() => void onToggleSignup()}
                className={cn(
                  'ring-gold-focus relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                  signupOpen ? 'bg-gold-500/80' : 'bg-secondary',
                )}
              >
                <span
                  className={cn(
                    'inline-block size-5 transform rounded-full bg-white shadow transition-transform',
                    signupOpen ? 'translate-x-5' : 'translate-x-0.5',
                  )}
                />
              </button>
            </div>
          </div>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label={t('stats.pending')} value={pending} icon={Clock} primary tone="warning" />
        <StatCard label={t('stats.approved')} value={approved} icon={UserCheck} tone="success" />
        <StatCard label={t('stats.rejected')} value={rejected} icon={X} />
      </div>

      {!isLive ? (
        <Card elevation={1} className="p-6">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-gold-300" />
            <div>
              <p className="text-sm font-medium">{t('liveOnly.title')}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t('liveOnly.body')}</p>
            </div>
          </div>
        </Card>
      ) : (
        <Card elevation={1} className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-[color-mix(in_srgb,var(--surface-2)_45%,transparent)] text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  <th className="px-4 py-3 text-start">{t('table.requester')}</th>
                  <th className="px-4 py-3 text-start">{t('table.reason')}</th>
                  <th className="px-4 py-3 text-start">{t('table.requested')}</th>
                  <th className="px-4 py-3 text-start">{t('table.status')}</th>
                  <th className="w-12 px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-16 text-center">
                      <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={5}>
                      <EmptyState
                        icon={Inbox}
                        title={t(filter === 'PENDING' ? 'empty.pendingTitle' : 'empty.allTitle')}
                        description={t('empty.body')}
                      />
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr
                      key={r.id}
                      className="border-b border-border-subtle/60 transition-colors last:border-0 hover:bg-gold-500/[0.05] hover:shadow-[inset_2px_0_0_rgba(212,175,55,0.55)]"
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground">{r.displayName || r.username}</p>
                        <p className="text-xs text-muted-foreground" dir="ltr">
                          {r.email}
                        </p>
                      </td>
                      <td className="max-w-[320px] px-4 py-3">
                        <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                          {r.reason || <span className="opacity-50">—</span>}
                        </p>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground tabular-nums">
                        {fmt(r.createdAt)}
                        {r.ip && (
                          <span className="ms-2 opacity-60" dir="ltr">
                            {r.ip}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={STATUS_VARIANT[r.status]} className="capitalize">
                          {t(`status.${r.status}`)}
                        </Badge>
                        {r.reviewNote && (
                          <p className="mt-1 max-w-[200px] truncate text-[11px] text-muted-foreground/70">
                            {r.reviewNote}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-end">
                        {busyId === r.id ? (
                          <Loader2 className="ms-auto size-4 animate-spin text-muted-foreground" />
                        ) : r.status === 'PENDING' ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <Button size="sm" onClick={() => openApprove(r)} className="gap-1.5">
                              <Check className="size-3.5" />
                              {t('actions.approve')}
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon-sm" aria-label={t('actions.more')}>
                                  <MoreHorizontal className="size-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() => void onReject(r)}
                                  className="text-destructive focus:text-destructive"
                                >
                                  <X className="size-4" />
                                  {t('actions.reject')}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => void onDelete(r)}
                                  className="text-destructive focus:text-destructive"
                                >
                                  <Trash2 className="size-4" />
                                  {t('actions.delete')}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        ) : (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon-sm" aria-label={t('actions.more')}>
                                <MoreHorizontal className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => void onDelete(r)}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="size-4" />
                                {t('actions.delete')}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── Approve dialog: mints the real account ───────────────────────── */}
      <Dialog open={!!approving} onOpenChange={(o) => !o && setApproving(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="size-4 text-gold-300" />
              {t('approve.title')}
            </DialogTitle>
            <DialogDescription>{t('approve.description', { email: approving?.email ?? '' })}</DialogDescription>
          </DialogHeader>

          <form onSubmit={onApprove} className="flex flex-col gap-4">
            <div>
              <Label htmlFor="ar-license" className="flex items-center gap-1.5">
                <CalendarClock className="size-3.5 text-gold-300" /> {tLicense('presetLabel')}
              </Label>
              <div id="ar-license" role="radiogroup" className="mt-1.5 flex flex-wrap gap-1.5">
                {PRESET_ORDER.map((p) => {
                  const selected = preset === p;
                  return (
                    <button
                      key={p}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setPreset(p)}
                      className={cn(
                        'ring-gold-focus rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors duration-150',
                        selected
                          ? 'border-[rgba(212,175,55,0.5)] bg-gold-500/15 text-gold-200'
                          : 'border-border-subtle text-muted-foreground hover:border-[rgba(212,175,55,0.35)] hover:text-foreground',
                      )}
                    >
                      {tLicense(`presets.${p}`)}
                    </button>
                  );
                })}
              </div>
              {preset === 'custom' && (
                <Input
                  type="datetime-local"
                  dir="ltr"
                  aria-label={tLicense('presets.custom')}
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  className="mt-2"
                />
              )}
              <p className="mt-1.5 text-[11px] text-muted-foreground">{t('approve.licenseHint')}</p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ar-note">{t('approve.noteLabel')}</Label>
              <Input
                id="ar-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t('approve.notePlaceholder')}
                maxLength={2000}
              />
            </div>

            <div className="flex items-start gap-2.5 rounded-[var(--radius-md)] border border-gold-500/30 bg-gold-500/[0.06] px-3 py-2.5">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-gold-300" />
              <p className="text-[11px] leading-relaxed text-muted-foreground">{t('approve.notice')}</p>
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setApproving(null)}>
                {t('actions.cancel')}
              </Button>
              <Button type="submit" loading={submitting} className="gap-1.5">
                {!submitting && <Check className="size-4" />}
                {t('actions.approve')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
