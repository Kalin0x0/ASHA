'use client';

import { ArrowLeft, ArrowRight, CheckCircle2, ClipboardCheck, Clock, ShieldCheck, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
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
    <div className="flex min-h-screen w-full bg-anthracite-950">
      {/* ── Showcase panel — mirrors the sign-in screen ─────────────────── */}
      <aside className="relative hidden flex-[1.1] flex-col justify-between overflow-hidden p-12 md:flex lg:p-[52px]">
        <div
          aria-hidden
          className="absolute inset-0 scale-[1.04] bg-cover bg-center"
          style={{ backgroundImage: "url('/backgrounds/nature-forest.jpg')" }}
        />
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(150deg, color-mix(in srgb, var(--color-anthracite-950) 78%, transparent), color-mix(in srgb, var(--color-anthracite-900) 52%, transparent) 50%, color-mix(in srgb, #5a3d12 35%, transparent))',
          }}
        />
        <div
          aria-hidden
          className="absolute inset-0"
          style={{ background: 'radial-gradient(70% 60% at 78% 28%, rgba(212,175,55,0.22), transparent 60%)' }}
        />
        <div aria-hidden className="absolute inset-0" style={{ boxShadow: 'inset 0 0 160px 30px rgba(8,8,16,0.6)' }} />
        <div
          aria-hidden
          className="absolute inset-y-0 end-0 w-px"
          style={{ background: 'linear-gradient(180deg, transparent, rgba(212,175,55,0.5), transparent)' }}
        />

        <div className="relative flex items-center gap-3.5">
          <AshaMark className="size-[52px] rounded-2xl shadow-[0_8px_24px_-6px_rgba(0,0,0,0.6)]" />
          <span className="font-display text-[26px] font-semibold tracking-[0.06em] text-white">ASHA</span>
        </div>

        {/* How it works — sets the expectation that a human reviews this */}
        <div className="relative max-w-[460px]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold-300">{t('showcase.eyebrow')}</p>
          <h2 className="mt-3.5 font-display text-[2.5rem] font-semibold leading-[1.08] tracking-[-0.03em] text-white text-balance">
            {t.rich('showcase.headline', {
              gold: (chunks) => <span className="text-gradient-gold">{chunks}</span>,
            })}
          </h2>
          <ol className="mt-7 flex flex-col gap-4">
            {STEPS.map(({ Icon, key }, i) => (
              <li key={key} className="flex items-start gap-3.5">
                <span className="relative inline-flex size-[34px] shrink-0 items-center justify-center rounded-[10px] border border-gold-500/30 bg-gold-500/[0.14] text-gold-300">
                  <Icon className="size-4" />
                  <span className="absolute -end-1 -top-1 flex size-[18px] items-center justify-center rounded-full bg-gold-500 text-[10px] font-bold text-anthracite-950">
                    {i + 1}
                  </span>
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">{t(`showcase.steps.${key}.title`)}</p>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-white/75">
                    {t(`showcase.steps.${key}.body`)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="relative text-xs text-white/60">{tAuth('showcase.footer')}</div>
      </aside>

      {/* ── Request panel ──────────────────────────────────────────────── */}
      <main className="bg-aurora relative flex flex-1 items-center justify-center p-6 sm:p-10 md:min-w-[400px] md:flex-[0.9]">
        <div className="w-[380px] max-w-full animate-fade-up">
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

              <form onSubmit={onSubmit} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="email">{t('emailLabel')}</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
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
                    className="ring-gold-focus min-h-[76px] w-full resize-y rounded-md border border-input bg-[var(--surface-1)] px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 transition-colors focus-visible:border-[rgba(212,175,55,0.5)] focus-visible:shadow-[var(--gold-glow)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  <p className="text-[11px] text-muted-foreground/70">{t('reasonHint')}</p>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="password">{t('passwordLabel')}</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="new-password"
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

                <Button type="submit" loading={loading} disabled={!canSubmit} size="lg" className="mt-1 w-full gap-2">
                  {!loading && <ArrowRight className="size-4 rtl:rotate-180" />}
                  {t('submit')}
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
                  className="ring-gold-focus rounded text-gold-300 transition-colors hover:text-gold-200 hover:underline"
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
