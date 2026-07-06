'use client';

import { Activity, Camera, Gauge, KeyRound, Loader2, Save, ShieldCheck, Timer, Trash2, User as UserIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input, Label } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { confirmTotp, disableTotp, enrollTotp, type TotpEnrollResponse } from '@/lib/api/endpoints';
import { isLive } from '@/lib/api/mode';
import { AvatarError, fileToAvatarDataUrl } from '@/lib/avatar-upload';
import { useAccount, useChangePassword, useMyTariff, useOwnSessions, useUpdateAccount } from '@/lib/hooks';
import { LOCALES } from '@/i18n/locales';
import { useProfileDialog } from '@/lib/profile-store';
import { cn } from '@/lib/utils';

type Tab = 'profile' | 'security' | 'plan';

const ACTIVE_SESSION_STATUSES = new Set(['REQUESTED', 'SCHEDULED', 'PROVISIONING', 'RUNNING', 'DEGRADED', 'PAUSED']);

function initialsOf(name: string) {
  return (
    name
      .split(/[\s@._-]+/)
      .filter(Boolean)
      .map((w) => w[0]!)
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'A'
  );
}

export function ProfileDialog() {
  const { open, closeProfile } = useProfileDialog();
  const t = useTranslations('portal');
  const [tab, setTab] = useState<Tab>('profile');
  const account = useAccount();

  const displayName = account?.displayName || account?.username || account?.email || 'Asha';

  const tabs: { key: Tab; icon: typeof UserIcon; label: string }[] = [
    { key: 'profile', icon: UserIcon, label: t('account.tabs.profile') },
    { key: 'security', icon: ShieldCheck, label: t('account.tabs.security') },
    { key: 'plan', icon: Gauge, label: t('account.tabs.plan') },
  ];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && closeProfile()}>
      <DialogContent className="max-w-3xl overflow-hidden p-0">
        <DialogTitle className="sr-only">{t('account.title')}</DialogTitle>
        <DialogDescription className="sr-only">{t('account.subtitle')}</DialogDescription>

        <div className="flex max-h-[80vh] flex-col sm:flex-row">
          {/* Left rail */}
          <aside className="shrink-0 border-b border-border-subtle bg-anthracite-950/40 p-4 sm:w-56 sm:border-b-0 sm:border-e">
            <div className="flex items-center gap-3">
              <Avatar className="size-11">
                {account?.avatarUrl && <AvatarImage src={account.avatarUrl} alt="" />}
                <AvatarFallback className="text-sm">{initialsOf(displayName)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{displayName}</p>
                <p className="truncate text-xs text-muted-foreground">{account?.email}</p>
              </div>
            </div>
            <nav className="mt-4 flex gap-1 sm:flex-col">
              {tabs.map(({ key, icon: Icon, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  className={cn(
                    'flex flex-1 items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors sm:flex-none',
                    tab === key ? 'bg-gold-500/10 text-gold-200' : 'text-muted-foreground hover:bg-secondary',
                  )}
                >
                  <Icon className="size-4" />
                  <span>{label}</span>
                </button>
              ))}
            </nav>
          </aside>

          {/* Content */}
          <div className="min-w-0 flex-1 overflow-y-auto p-6">
            {!account ? (
              <div className="flex h-40 items-center justify-center text-muted-foreground">
                <Loader2 className="size-5 animate-spin" />
              </div>
            ) : tab === 'profile' ? (
              <ProfileTab />
            ) : tab === 'security' ? (
              <SecurityTab />
            ) : (
              <PlanTab />
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Profile tab ───────────────────────────────────────────────────────────────
function ProfileTab() {
  const t = useTranslations('portal');
  const account = useAccount()!;
  const updateAccount = useUpdateAccount();
  const fileRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState(account.displayName ?? '');
  const [email, setEmail] = useState(account.email);
  const [locale, setLocale] = useState(account.locale);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(account.avatarUrl);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const dirty = displayName !== (account.displayName ?? '') || email !== account.email || locale !== account.locale || avatarUrl !== account.avatarUrl;

  const onPickFile = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      setAvatarUrl(await fileToAvatarDataUrl(file));
    } catch (err) {
      toast.error(err instanceof AvatarError ? t(`account.avatarErrors.${err.message}` as never) : t('account.avatarErrors.decode-failed'));
    } finally {
      setUploading(false);
    }
  };

  const onSave = async () => {
    setSaving(true);
    try {
      await updateAccount({
        displayName: displayName.trim() || null,
        locale,
        avatarUrl,
        ...(account.isLocalAccount && email.trim().toLowerCase() !== account.email ? { email: email.trim() } : {}),
      });
      toast.success(t('account.toasts.saved'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('account.toasts.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const initials = initialsOf(displayName || account.username || account.email);

  return (
    <div className="space-y-6">
      <SectionHeader icon={UserIcon} title={t('account.tabs.profile')} description={t('account.profile.description')} />

      {/* Avatar */}
      <div className="flex items-center gap-4">
        <Avatar className="size-20 border border-border-subtle">
          {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
          <AvatarFallback className="text-xl">{initials}</AvatarFallback>
        </Avatar>
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => void onPickFile(e.target.files?.[0]).finally(() => (e.target.value = ''))}
            />
            <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Camera className="size-3.5" />}
              {t('account.profile.uploadPhoto')}
            </Button>
            {avatarUrl && (
              <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setAvatarUrl(null)}>
                <Trash2 className="size-3.5" /> {t('account.profile.removePhoto')}
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{t('account.profile.photoHint')}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t('account.profile.displayName')}>
          <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder={account.username} />
        </Field>
        <Field label={t('account.profile.username')}>
          <Input value={account.username} disabled />
        </Field>
        <Field label={t('account.profile.email')}>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={!account.isLocalAccount}
          />
          {!account.isLocalAccount && <p className="mt-1 text-[11px] text-muted-foreground">{t('account.profile.emailManaged')}</p>}
        </Field>
        <Field label={t('account.profile.language')}>
          <select
            value={locale}
            onChange={(e) => setLocale(e.target.value)}
            className="h-9 w-full rounded-md border border-border-subtle bg-anthracite-950/40 px-2 text-sm outline-none ring-gold-focus"
          >
            {LOCALES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="flex justify-end">
        <Button size="sm" onClick={() => void onSave()} disabled={!dirty || saving}>
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
          {t('account.save')}
        </Button>
      </div>
    </div>
  );
}

// ── Security tab ──────────────────────────────────────────────────────────────
function SecurityTab() {
  const t = useTranslations('portal');
  const account = useAccount()!;
  const changePassword = useChangePassword();
  const confirm = useConfirm();

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [saving, setSaving] = useState(false);

  const onChangePassword = async () => {
    if (next.length < 8) return toast.error(t('account.security.tooShort'));
    if (next !== confirmPw) return toast.error(t('account.security.mismatch'));
    setSaving(true);
    try {
      await changePassword({ currentPassword: account.hasPassword ? current : undefined, newPassword: next });
      toast.success(t('account.security.passwordSaved'));
      setCurrent('');
      setNext('');
      setConfirmPw('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('account.security.passwordFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <SectionHeader icon={KeyRound} title={t('account.security.passwordTitle')} description={t('account.security.passwordDescription')} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {account.hasPassword && (
          <Field label={t('account.security.current')}>
            <Input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </Field>
        )}
        <Field label={t('account.security.new')}>
          <Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <Field label={t('account.security.confirm')}>
          <Input type="password" autoComplete="new-password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} />
        </Field>
      </div>
      <div className="flex justify-end">
        <Button size="sm" onClick={() => void onChangePassword()} disabled={saving || !next}>
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : <KeyRound className="size-3.5" />}
          {t('account.security.updatePassword')}
        </Button>
      </div>

      <div className="border-t border-border-subtle pt-6">
        <TwoFactorSection twoFactorEnabled={account.twoFactorEnabled} confirm={confirm} />
      </div>
    </div>
  );
}

function TwoFactorSection({ twoFactorEnabled, confirm }: { twoFactorEnabled: boolean; confirm: ReturnType<typeof useConfirm> }) {
  const t = useTranslations('portal');
  const [enrolled, setEnrolled] = useState(twoFactorEnabled);
  const [pending, setPending] = useState<TotpEnrollResponse | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const onEnroll = async () => {
    if (!isLive) return toast.error(t('account.liveOnly'));
    setBusy(true);
    try {
      setPending(await enrollTotp());
    } catch {
      toast.error(t('account.security.twoFactorFailed'));
    } finally {
      setBusy(false);
    }
  };

  const onConfirm = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      await confirmTotp({ methodId: pending.methodId, code });
      toast.success(t('account.security.twoFactorEnabled'));
      setEnrolled(true);
      setPending(null);
      setCode('');
    } catch {
      toast.error(t('account.security.invalidCode'));
    } finally {
      setBusy(false);
    }
  };

  const onDisable = async () => {
    if (!isLive) return toast.error(t('account.liveOnly'));
    const ok = await confirm({ title: t('account.security.disable2faTitle'), description: t('account.security.disable2faBody'), destructive: true });
    if (!ok) return;
    setBusy(true);
    try {
      await disableTotp();
      setEnrolled(false);
      toast.success(t('account.security.twoFactorDisabled'));
    } catch {
      toast.error(t('account.security.twoFactorFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <SectionHeader icon={ShieldCheck} title={t('account.security.twoFactorTitle')} description={t('account.security.twoFactorDescription')} />
      <div className="mt-4 flex items-center gap-2">
        <Badge variant={enrolled ? 'success' : 'outline'}>
          {enrolled ? t('account.security.enabled') : t('account.security.disabled')}
        </Badge>
        {enrolled ? (
          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => void onDisable()} disabled={busy}>
            {t('account.security.disable')}
          </Button>
        ) : (
          !pending && (
            <Button size="sm" variant="secondary" onClick={() => void onEnroll()} disabled={busy}>
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldCheck className="size-3.5" />}
              {t('account.security.enable')}
            </Button>
          )
        )}
      </div>

      {pending && (
        <div className="mt-4 flex flex-col items-start gap-4 rounded-lg border border-border-subtle p-4 sm:flex-row">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={pending.qrDataUrl} alt="TOTP QR" className="size-36 rounded-md border border-border-subtle bg-white p-1" />
          <div className="flex-1 space-y-2">
            <p className="text-sm text-muted-foreground">{t('account.security.scanHint')}</p>
            <div className="flex gap-2">
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" inputMode="numeric" className="max-w-[140px]" />
              <Button size="sm" onClick={() => void onConfirm()} disabled={busy || code.length < 6}>
                {t('account.security.verify')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Plan tab ──────────────────────────────────────────────────────────────────
function PlanTab() {
  const t = useTranslations('portal');
  const tariff = useMyTariff();
  const sessions = useOwnSessions();
  const activeCount = sessions.filter((s) => ACTIVE_SESSION_STATUSES.has(s.status)).length;

  const fmtMin = (m: number) => {
    const h = Math.floor(m / 60);
    const min = m % 60;
    return h > 0 ? `${h}h ${min}m` : `${min}m`;
  };

  return (
    <div className="space-y-6">
      <SectionHeader icon={Gauge} title={t('account.plan.title')} description={t('account.plan.description')} />

      {!tariff ? (
        <div className="rounded-lg border border-border-subtle p-5 text-center">
          <p className="text-sm font-medium">{t('account.plan.unlimited')}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t('account.plan.unlimitedHint')}</p>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-display text-lg font-medium">{tariff.name}</span>
              <Badge variant="outline">{t(`tariff.periods.${tariff.period}` as never)}</Badge>
            </div>
            {tariff.budgetMinutes != null && (
              <span className="inline-flex items-center gap-1.5 text-sm tabular-nums text-gold-200">
                <Timer className="size-4" /> {fmtMin(Math.floor(tariff.remainingSeconds / 60))} {t('account.plan.left')}
              </span>
            )}
          </div>

          {tariff.budgetMinutes != null && (
            <div>
              <Progress
                value={100 - Math.min(100, (tariff.remainingSeconds / (tariff.budgetMinutes * 60)) * 100)}
                tone={tariff.remainingSeconds < 15 * 60 ? 'warning' : 'gold'}
              />
              <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
                <span>{t('account.plan.used')}</span>
                <span className="tabular-nums">
                  {fmtMin(tariff.budgetMinutes - Math.floor(tariff.remainingSeconds / 60))} / {fmtMin(tariff.budgetMinutes)}
                </span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatBox icon={Activity} label={t('account.plan.activeSessions')} value={tariff.maxConcurrent != null ? `${activeCount} / ${tariff.maxConcurrent}` : String(activeCount)} />
            <StatBox icon={Timer} label={t('account.plan.maxSession')} value={tariff.maxSessionMinutes != null ? fmtMin(tariff.maxSessionMinutes) : t('account.plan.noLimit')} />
            <StatBox icon={Gauge} label={t('account.plan.budget')} value={tariff.budgetMinutes != null ? fmtMin(tariff.budgetMinutes) : t('account.plan.noLimit')} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Small building blocks ─────────────────────────────────────────────────────
function SectionHeader({ icon: Icon, title, description }: { icon: typeof UserIcon; title: string; description: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-gold-500/30 bg-gold-500/[0.1] text-gold-300">
        <Icon className="size-4" />
      </span>
      <div>
        <h3 className="font-display text-base font-medium">{title}</h3>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function StatBox({ icon: Icon, label, value }: { icon: typeof UserIcon; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border-subtle p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3.5" /> {label}
      </div>
      <p className="mt-1 font-display text-lg font-medium tabular-nums">{value}</p>
    </div>
  );
}
