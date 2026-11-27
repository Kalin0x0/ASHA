'use client';

import { ArrowLeft, ArrowRight, CheckCircle2, ClipboardCheck, Clock, ShieldCheck, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { AuthShowcase } from '@/components/auth/auth-showcase';
import { AshaMark } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { getAccountRequestConfig, submitAccountRequest } from '@/lib/api/endpoints';
import { isLive } from '@/lib/api/mode';

const MIN_PASSWORD = 8;

const STEPS = [
  { Icon: UserPlus, key: 'submit' },
  { Icon: ClipboardCheck, key: 'review' },
  { Icon: CheckCircle2, key: 'signIn' },
] as const;

export default function RequestAccessPage() {
  const router = useRouter();
  const t = useTranslations('auth.request');
  const tAuth = useTranslations('auth');

  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [reason, setReason] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  /** null = still checking, so we don't flash "unavailable" on a slow network. */
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    if (!isLive) {
      setEnabled(true);
      return;
    }
    getAccountRequestConfig()
      .then((c) => setEnabled(c.enabled))
      .catch(() => setEnabled(false));
  }, []);

  const passwordTooShort = password.length > 0 && password.length < MIN_PASSWORD;
  const mismatch = confirm.length > 0 && password !== confirm;
  const canSubmit = !!email && password.length >= MIN_PASSWORD && password === confirm && !loading;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    if (!isLive) {
      setTimeout(() => {
        setDone(true);
        setLoading(false);
      }, 650);
      return;
    }
    try {
      await submitAccountRequest({
        email,
        displayName: displayName || undefined,
        reason: reason || undefined,
        password,
      });
      setDone(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('errors.failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-dvh w-full bg-anthracite-950 lg:grid-cols-[minmax(0,1.15fr)_minmax(440px,0.85fr)]">
      {/* ── Same stage as sign-in; here it explains that a person reviews this. */}
      <AuthShowcase
        id="request-pitch"
        eyebrow={t('showcase.eyebrow')}
        headline={t.rich('showcase.headline', {
          gold: (chunks) => <span className="text-gradient-gold">{chunks}</span>,
        })}
        footer={tAuth('showcase.footer')}
      >
        <ol className="mt-6 grid gap-5 sm:grid-cols-3 sm:gap-6">
          {STEPS.map(({ Icon, key }, i) => (
            <li key={key}>
              <span className="relative inline-flex size-9 items-center justify-center rounded-[10px] border border-gold-500/30 bg-gold-500/[0.12] text-gold-300">
                <Icon className="size-[18px]" aria-hidden />
                <span className="absolute -end-1.5 -top-1.5 flex size-[18px] items-center justify-center rounded-full bg-gold-500 text-[10px] font-bold text-anthracite-950">
                  {i + 1}
                </span>
              </span>
              <p className="mt-3 text-sm font-semibold text-white">{t(`showcase.steps.${key}.title`)}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-white/65">{t(`showcase.steps.${key}.body`)}</p>
            </li>
          ))}
        </ol>
      </AuthShowcase>

      {/* ── Request panel ──────────────────────────────────────────────── */}
      <main className="bg-aurora relative order-1 flex min-h-dvh flex-col px-6 pb-6 pt-6 sm:px-10 lg:order-2">
        <div className="flex items-center gap-2.5 lg:hidden">
          <AshaMark className="size-9 rounded-lg" />
          <span className="font-display text-lg font-semibold tracking-[0.08em]">ASHA</span>
        </div>
        <div className="mx-auto flex w-full max-w-[400px] flex-1 animate-fade-up flex-col justify-center py-10">
          {done ? (
            /* Submitted — nothing exists yet, an admin must approve. */
            <div className="text-center">
              <span className="mx-auto flex size-14 items-center justify-center rounded-2xl border border-gold-500/30 bg-gold-500/[0.1] text-gold-300">
                <Clock className="size-6" />
              </span>
              <h1 className="mt-5 font-display text-2xl font-semibold tracking-tight">{t('done.title')}</h1>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t('done.body')}</p>
              <div className="mt-6 rounded-[var(--radius-md)] border border-border-subtle bg-[color-mix(in_srgb,var(--surface-1)_50%,transparent)] p-3.5 text-start">
                <p className="text-xs text-muted-foreground">{t('done.next')}</p>
              </div>
              <Button
                variant="secondary"
                size="lg"
                className="mt-6 w-full gap-2 border border-border-subtle"
                onClick={() => router.push('/login')}
              >
                <ArrowLeft className="size-4 rtl:rotate-180" />
                {t('backToSignIn')}
              </Button>
            </div>
          ) : enabled === false ? (
            /* Operator has not switched public sign-up on. */
            <div className="text-center">
              <span className="mx-auto flex size-14 items-center justify-center rounded-2xl border border-border-subtle bg-[color-mix(in_srgb,var(--surface-1)_60%,transparent)] text-muted-foreground">
                <ShieldCheck className="size-6" />
              </span>
              <h1 className="mt-5 font-display text-2xl font-semibold tracking-tight">{t('disabled.title')}</h1>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t('disabled.body')}</p>
              <Button
                variant="secondary"
                size="lg"
                className="mt-6 w-full gap-2 border border-border-subtle"
                onClick={() => router.push('/login')}
              >
                <ArrowLeft className="size-4 rtl:rotate-180" />
                {t('backToSignIn')}
              </Button>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <h1 className="font-display text-3xl font-semibold tracking-tight">
                  {t.rich('title', { gold: (chunks) => <span className="text-gradient-gold">{chunks}</span> })}
                </h1>
                <p className="mt-1.5 text-sm text-muted-foreground">{t('subtitle')}</p>
              </div>

              <form onSubmit={onSubmit} className="flex flex-col gap-5">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="email">{t('emailLabel')}</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    dir="ltr"
                    className="h-11 text-base sm:text-sm"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={tAuth('emailPlaceholder')}
                    required
                    disabled={enabled === null}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="displayName">{t('nameLabel')}</Label>
                  <Input
                    id="displayName"
                    type="text"
                    autoComplete="name"
                    dir="auto"
                    className="h-11 text-base sm:text-sm"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder={t('namePlaceholder')}
                    disabled={enabled === null}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="reason">{t('reasonLabel')}</Label>
                  <textarea
                    id="reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder={t('reasonPlaceholder')}
                    rows={3}
                    maxLength={2000}
                    disabled={enabled === null}
                    className="ring-gold-focus min-h-[76px] w-full resize-y rounded-md border border-input bg-[var(--surface-1)] px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 transition-colors focus-visible:border-gold-500/50 focus-visible:shadow-[var(--gold-glow)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  <p className="text-[11px] text-muted-foreground/70">{t('reasonHint')}</p>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="password">{t('passwordLabel')}</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="new-password"
                    className="h-11 text-base sm:text-sm"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••"
                    required
                    minLength={MIN_PASSWORD}
                    aria-invalid={passwordTooShort || undefined}
                    aria-describedby="password-hint"
                    disabled={enabled === null}
                  />
                  <p
                    id="password-hint"
                    className={`text-[11px] ${passwordTooShort ? 'text-destructive' : 'text-muted-foreground/70'}`}
                  >
                    {t('passwordHint', { min: MIN_PASSWORD })}
                  </p>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="confirm">{t('confirmLabel')}</Label>
                  <Input
                    id="confirm"
                    type="password"
                    autoComplete="new-password"
                    className="h-11 text-base sm:text-sm"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="••••••••••"
                    required
                    aria-invalid={mismatch || undefined}
                    aria-describedby={mismatch ? 'confirm-error' : undefined}
                    disabled={enabled === null}
                  />
                  {mismatch && (
                    <p id="confirm-error" className="text-[11px] text-destructive">
                      {t('errors.mismatch')}
                    </p>
                  )}
                </div>

                <Button type="submit" loading={loading} disabled={!canSubmit} size="lg" className="h-11 w-full gap-2">
                  {t('submit')}
                  {!loading && <ArrowRight className="size-4 rtl:rotate-180" aria-hidden />}
                </Button>
              </form>

              <div className="mt-6 flex items-start gap-2.5 rounded-[var(--radius-md)] border border-gold-500/30 bg-gold-500/[0.06] px-3.5 py-3">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-gold-300" />
                <p className="text-xs leading-relaxed text-muted-foreground">{t('approvalNotice')}</p>
              </div>

              <p className="mt-5 text-center text-sm text-muted-foreground">
                {t('haveAccount')}{' '}
                <Link
                  href="/login"
                  className="ring-gold-focus rounded text-gold-300 underline-offset-4 transition-colors hover:text-gold-200 hover:underline"
                >
                  {t('backToSignIn')}
                </Link>
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
