'use client';

import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CircleAlert,
  Eye,
  EyeOff,
  Fingerprint,
  KeyRound,
  MonitorSmartphone,
  Network,
  ShieldCheck,
  Timer,
  UserRound,
  Zap,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { WorkspaceStage } from '@/components/auth/workspace-stage';
import { AshaMark } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { useAuth } from '@/lib/api/auth-context';
import { getAuth } from '@/lib/api/auth-store';
import {
  type ApiPublicAuthProvider,
  getAccountRequestConfig,
  getDemoConfig,
  getPublicAuthProviders,
  ssoLoginUrl,
} from '@/lib/api/endpoints';
import { isLive } from '@/lib/api/mode';
import { computeDeviceFingerprint } from '@/lib/device-fingerprint';
import { canAccessAdmin } from '@/lib/nav';
import {
  type SignInFailure,
  type SignInStep,
  classifySignInError,
  isCompleteOtp,
  looksLikeEmail,
  normalizeOtp,
} from '@/lib/sign-in-flow';
import { cn } from '@/lib/utils';

/** The last organization someone signed in to, so they are not asked twice. */
const ORG_KEY = 'asha.sign-in.org';

const FEATURES = [
  { Icon: MonitorSmartphone, key: 'desktops' },
  { Icon: ShieldCheck, key: 'zeroTrust' },
  { Icon: UserRound, key: 'live' },
] as const;

type ScreenError = SignInFailure | 'code-incomplete' | 'identifier-missing' | 'passkey' | 'demo';

const ERROR_KEY: Record<ScreenError, string> = {
  'invalid-credentials': 'errors.invalidCredentials',
  'second-factor-required': 'errors.signInFailed',
  'second-factor-invalid': 'errors.codeInvalid',
  'second-factor-reused': 'errors.codeReused',
  'rate-limited': 'errors.rateLimited',
  timeout: 'errors.timeout',
  unknown: 'errors.signInFailed',
  'code-incomplete': 'errors.codeIncomplete',
  'identifier-missing': 'errors.enterEmailFirst',
  passkey: 'errors.passkeyFailed',
  demo: 'errors.demoFailed',
};

const ALERT = 'flex gap-2.5 rounded-md border border-destructive/45 bg-destructive/10 px-3.5 py-3 text-sm';

function readRememberedOrg(): string {
  try {
    return window.localStorage.getItem(ORG_KEY) ?? '';
  } catch {
    return '';
  }
}

function rememberOrg(slug: string) {
  try {
    if (slug) window.localStorage.setItem(ORG_KEY, slug);
    else window.localStorage.removeItem(ORG_KEY);
  } catch {
    /* private mode — this is only a convenience */
  }
}

/**
 * Sign-in, as a short conversation: who you are and your password first, the
 * authenticator code only when that account has one, the demo on its own page.
 * The other half of the screen says what Asha is, for anyone landing here first.
 */
export default function LoginPage() {
  const router = useRouter();
  const t = useTranslations('auth');
  const { login, loginWithPasskey, loginAsDemo } = useAuth();

  const [step, setStep] = useState<SignInStep>('credentials');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [otp, setOtp] = useState('');
  const [orgSlug, setOrgSlug] = useState('');
  const [orgOpen, setOrgOpen] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [demoEmail, setDemoEmail] = useState('');
  const [error, setError] = useState<ScreenError | null>(null);
  const [busy, setBusy] = useState<'password' | 'code' | 'passkey' | 'demo' | null>(null);
  const [demoEnabled, setDemoEnabled] = useState(false);
  const [signupEnabled, setSignupEnabled] = useState(false);
  const [ssoProviders, setSsoProviders] = useState<ApiPublicAuthProvider[]>([]);

  const identifierRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const otpRef = useRef<HTMLInputElement>(null);
  const orgRef = useRef<HTMLInputElement>(null);
  const demoRef = useRef<HTMLInputElement>(null);
  // One request at a time: a self-submitting code and a pressed Enter must not
  // both spend the same TOTP window.
  const inFlight = useRef(false);

  useEffect(() => {
    // An invitation link's ?org= wins over the one remembered from last time.
    const fromUrl = new URLSearchParams(window.location.search).get('org')?.trim() ?? '';
    const slug = fromUrl || readRememberedOrg();
    if (slug) {
      setOrgSlug(slug);
      setOrgOpen(true);
    }
    if (!isLive) return;
    getPublicAuthProviders()
      .then(setSsoProviders)
      .catch(() => setSsoProviders([]));
    getDemoConfig()
      .then((c) => setDemoEnabled(c.enabled))
      .catch(() => setDemoEnabled(false));
    getAccountRequestConfig()
      .then((c) => setSignupEnabled(c.enabled))
      .catch(() => setSignupEnabled(false));
  }, []);

  // Each step hands focus to its field, so keyboard and screen-reader users
  // land where the work is instead of back at the top of the page.
  useEffect(() => {
    if (step === 'second-factor') otpRef.current?.focus();
    else if (step === 'demo') demoRef.current?.focus();
  }, [step]);

  const sso = ssoProviders.filter((p) => p.type !== 'LDAP');
  const showDemo = demoEnabled || !isLive;
  const showSignup = signupEnabled || !isLive;
  const org = orgSlug.trim() || undefined;

  const finish = () => {
    setPassword('');
    const user = getAuth().user;
    router.push(canAccessAdmin(user?.permissions, user?.isSystemAdmin ?? false) ? '/dashboard' : '/');
  };

  const settle = (kind: ScreenError | null) => {
    setError(kind);
    setBusy(null);
    inFlight.current = false;
  };

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inFlight.current) return;
    setError(null);
    if (!isLive) {
      router.push('/dashboard');
      return;
    }
    inFlight.current = true;
    setBusy('password');
    try {
      await login(identifier.trim(), password, undefined, org);
      rememberOrg(org ?? '');
      finish();
    } catch (err) {
      const kind = classifySignInError(err);
      if (kind === 'second-factor-required') {
        setOtp('');
        setStep('second-factor');
        settle(null);
        return;
      }
      settle(kind);
      passwordRef.current?.select();
    }
  };

  const submitCode = async (code: string) => {
    if (inFlight.current) return;
    if (!isCompleteOtp(code)) {
      setError('code-incomplete');
      otpRef.current?.focus();
      return;
    }
    setError(null);
    inFlight.current = true;
    setBusy('code');
    try {
      await login(identifier.trim(), password, code, org);
      rememberOrg(org ?? '');
      finish();
    } catch (err) {
      const kind = classifySignInError(err);
      setOtp('');
      if (kind === 'invalid-credentials') {
        // The account itself was refused (disabled, or the password changed in
        // the meantime). The code is not the problem, so go back to where the
        // problem can be fixed.
        setPassword('');
        setStep('credentials');
        settle(kind);
        return;
      }
      settle(kind);
      otpRef.current?.focus();
    }
  };

  const onOtpChange = (raw: string) => {
    const code = normalizeOtp(raw);
    setOtp(code);
    if (error) setError(null);
    // Authenticator autofill and pasting hand over all six digits at once; a
    // complete code submits itself.
    if (code.length === 6) void submitCode(code);
  };

  const backToPassword = () => {
    setOtp('');
    setError(null);
    setStep('credentials');
    requestAnimationFrame(() => passwordRef.current?.focus());
  };

  const onPasskey = async () => {
    if (!isLive) {
      router.push('/dashboard');
      return;
    }
    if (!identifier.trim()) {
      setError('identifier-missing');
      identifierRef.current?.focus();
      return;
    }
    setError(null);
    setBusy('passkey');
    try {
      await loginWithPasskey(identifier.trim());
      finish();
    } catch {
      settle('passkey');
    }
  };

  const openDemo = () => {
    setError(null);
    // Read the field itself: a click right after typing can beat the re-render.
    const typed = identifierRef.current?.value ?? identifier;
    if (!demoEmail && looksLikeEmail(typed)) setDemoEmail(typed.trim());
    setStep('demo');
  };

  const submitDemo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLive) {
      router.push('/');
      return;
    }
    setError(null);
    setBusy('demo');
    try {
      await loginAsDemo(demoEmail.trim(), computeDeviceFingerprint());
      router.push('/');
    } catch {
      settle('demo');
    }
  };

  const openOrg = () => {
    setOrgOpen(true);
    setError(null);
    requestAnimationFrame(() => orgRef.current?.focus());
  };

  const errorText = error ? t(ERROR_KEY[error]) : null;
  const linkClass = 'ring-gold-focus rounded text-gold-300 transition-colors hover:text-gold-200 hover:underline';
  const quietClass =
    'ring-gold-focus inline-flex min-h-11 items-center justify-center gap-1.5 rounded text-sm text-muted-foreground transition-colors hover:text-foreground';

  return (
    <div className="grid min-h-dvh w-full bg-anthracite-950 lg:grid-cols-[minmax(0,1.15fr)_minmax(440px,0.85fr)]">
      {/* ── What Asha is. Beside the form on wide screens, below it on narrow
             ones: signing in comes first, the pitch is there for whoever wants it. */}
      <section
        aria-labelledby="asha-pitch"
        className="on-dark relative order-2 flex flex-col overflow-hidden px-6 py-14 sm:px-10 lg:order-1 lg:justify-between lg:px-14 lg:py-10"
      >
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(70% 55% at 70% 30%, rgb(var(--brand-rgb)/0.18), transparent 65%), radial-gradient(60% 50% at 0% 100%, rgb(var(--brand-rgb)/0.10), transparent 70%), linear-gradient(160deg, var(--color-slate-900), var(--color-slate-950) 70%)',
          }}
        />
        <div
          aria-hidden
          className="absolute inset-y-0 end-0 hidden w-px lg:block"
          style={{ background: 'linear-gradient(180deg, transparent, rgb(var(--brand-rgb)/0.45), transparent)' }}
        />

        <div className="relative hidden items-center gap-3 lg:flex">
          <AshaMark className="size-11 rounded-xl shadow-[0_8px_24px_-6px_rgba(0,0,0,0.6)]" />
          <span className="font-display text-xl font-semibold tracking-[0.08em] text-white">ASHA</span>
        </div>

        {/* Sized by the viewport's height too, so on a laptop the pitch below
            still fits beside the form without scrolling. */}
        <div className="relative mx-auto w-[88%] max-w-[640px] sm:w-full lg:my-2">
          <WorkspaceStage className="mx-auto w-[min(100%,560px,calc(38dvh*16/11))]" />
        </div>

        <div className="relative mx-auto w-full max-w-[640px]">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold-300">{t('showcase.eyebrow')}</p>
          <h2
            id="asha-pitch"
            className="mt-3 font-display text-[clamp(1.75rem,3vw,2.6rem)] font-semibold leading-[1.1] tracking-[-0.02em] text-white text-balance"
          >
            {t.rich('showcase.headline', {
              gold: (chunks) => <span className="text-gradient-gold">{chunks}</span>,
            })}
          </h2>
          <p className="mt-4 max-w-[56ch] text-[15px] leading-relaxed text-white/75">{t('showcase.lead')}</p>

          <ul className="mt-6 grid gap-5 sm:grid-cols-3 sm:gap-6">
            {FEATURES.map(({ Icon, key }) => (
              <li key={key}>
                <span className="inline-flex size-9 items-center justify-center rounded-[10px] border border-gold-500/30 bg-gold-500/[0.12] text-gold-300">
                  <Icon className="size-[18px]" aria-hidden />
                </span>
                <p className="mt-3 text-sm font-semibold text-white">{t(`showcase.features.${key}.title`)}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-white/65">{t(`showcase.features.${key}.body`)}</p>
              </li>
            ))}
          </ul>

          <p className="mt-6 text-xs text-white/50">{t('showcase.footer')}</p>
        </div>
      </section>

      {/* ── Sign-in ──────────────────────────────────────────────────────── */}
      <main className="bg-aurora relative order-1 flex min-h-dvh flex-col px-6 pb-6 pt-6 sm:px-10 lg:order-2">
        <div className="flex items-center gap-2.5 lg:hidden">
          <AshaMark className="size-9 rounded-lg" />
          <span className="font-display text-lg font-semibold tracking-[0.08em]">ASHA</span>
        </div>

        <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center py-10">
          {step === 'credentials' && (
            <div key="credentials" className="animate-fade-up">
              <h1 className="font-display text-3xl font-semibold tracking-tight">
                {t.rich('welcome', { gold: (chunks) => <span className="text-gradient-gold">{chunks}</span> })}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">{t('subtitle')}</p>

              <form onSubmit={submitPassword} className="mt-8 flex flex-col gap-5">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="identifier">{t('emailLabel')}</Label>
                  <Input
                    ref={identifierRef}
                    id="identifier"
                    name="username"
                    type="text"
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    dir="auto"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder={t('emailPlaceholder')}
                    className="h-11 text-base sm:text-sm"
                    required
                    autoFocus
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="password">{t('passwordLabel')}</Label>
                    <button
                      type="button"
                      aria-expanded={forgotOpen}
                      aria-controls="forgot-help"
                      onClick={() => setForgotOpen((v) => !v)}
                      className={cn(linkClass, '-my-3 inline-flex min-h-11 items-center px-1 text-xs')}
                    >
                      {t('forgotPassword')}
                    </button>
                  </div>
                  <div className="relative">
                    <Input
                      ref={passwordRef}
                      id="password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="h-11 pe-12 text-base sm:text-sm"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? t('hidePassword') : t('showPassword')}
                      aria-pressed={showPassword}
                      className="ring-gold-focus absolute inset-y-0 end-0 flex w-11 items-center justify-center rounded-e-md text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                  {forgotOpen && (
                    <p id="forgot-help" className="animate-fade-in text-xs leading-relaxed text-muted-foreground">
                      {t('forgotPasswordHelp')}
                    </p>
                  )}
                </div>

                {orgOpen && (
                  <div className="flex animate-fade-in flex-col gap-2">
                    <Label htmlFor="organization">{t('organizationLabel')}</Label>
                    <Input
                      ref={orgRef}
                      id="organization"
                      name="organization"
                      autoComplete="organization"
                      autoCapitalize="none"
                      spellCheck={false}
                      dir="ltr"
                      value={orgSlug}
                      onChange={(e) => setOrgSlug(e.target.value)}
                      aria-describedby="organization-hint"
                      className="h-11 text-base sm:text-sm"
                    />
                    <p id="organization-hint" className="text-xs text-muted-foreground">
                      {t('organizationHint')}
                    </p>
                  </div>
                )}

                {errorText && (
                  <div role="alert" className={ALERT}>
                    <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
                    <div className="min-w-0">
                      <p>{errorText}</p>
                      {error === 'invalid-credentials' && !orgOpen && (
                        <button type="button" onClick={openOrg} className={cn(linkClass, 'mt-1 text-xs')}>
                          {t('errors.orgHint')}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                <Button type="submit" loading={busy === 'password'} size="lg" className="h-11 w-full gap-2">
                  {t('signIn')}
                  {busy !== 'password' && <ArrowRight className="size-4 rtl:rotate-180" aria-hidden />}
                </Button>
              </form>

              <div className="mt-6 flex items-center gap-3" aria-hidden>
                <span className="h-px flex-1 bg-border-subtle" />
                <span className="text-xs text-muted-foreground">{t('or')}</span>
                <span className="h-px flex-1 bg-border-subtle" />
              </div>

              <div className={cn('mt-6 grid gap-2.5', (sso.length > 0 || !isLive) && 'sm:grid-cols-2')}>
                <Button
                  variant="secondary"
                  type="button"
                  loading={busy === 'passkey'}
                  onClick={() => void onPasskey()}
                  className="h-11 w-full gap-2.5 border border-border-subtle"
                >
                  {busy !== 'passkey' && <Fingerprint className="size-4 text-gold-300" aria-hidden />}
                  {t('passkey')}
                </Button>
                {isLive ? (
                  sso.map((p) => (
                    <Button
                      key={p.id}
                      variant="secondary"
                      type="button"
                      className="h-11 w-full gap-2.5 border border-border-subtle"
                      onClick={() => {
                        window.location.href = ssoLoginUrl(p);
                      }}
                    >
                      <Network className="size-4 text-info-400" aria-hidden />
                      <span className="truncate">{p.name}</span>
                    </Button>
                  ))
                ) : (
                  <Button
                    variant="secondary"
                    type="button"
                    className="h-11 w-full gap-2.5 border border-border-subtle"
                    onClick={() => router.push('/dashboard')}
                  >
                    <KeyRound className="size-4 text-info-400" aria-hidden />
                    {t('sso')}
                  </Button>
                )}
              </div>

              {(showDemo || showSignup) && (
                <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 text-sm">
                  {showDemo && (
                    <button type="button" onClick={openDemo} className={cn(linkClass, 'inline-flex min-h-11 items-center gap-1.5 px-1')}>
                      <Timer className="size-4" aria-hidden />
                      {t('demo.link')}
                    </button>
                  )}
                  {showSignup && (
                    <Link href="/request-access" className={cn(quietClass, 'px-1')}>
                      {t('requestAccessCta')}
                    </Link>
                  )}
                </div>
              )}
            </div>
          )}

          {step === 'second-factor' && (
            <div key="second-factor" className="animate-fade-up">
              <span className="inline-flex size-12 items-center justify-center rounded-xl border border-gold-500/30 bg-gold-500/[0.12] text-gold-300">
                <ShieldCheck className="size-6" aria-hidden />
              </span>
              <h1 className="mt-5 font-display text-3xl font-semibold tracking-tight">{t('secondFactor.title')}</h1>
              <p className="mt-2 text-sm text-muted-foreground">{t('secondFactor.subtitle')}</p>

              <div className="mt-5 flex items-center gap-2 rounded-md border border-border-subtle bg-[color-mix(in_srgb,var(--surface-1)_55%,transparent)] py-1 ps-3 pe-1 text-sm">
                <UserRound className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1 truncate" dir="auto">
                  {t('secondFactor.signingInAs', { name: identifier.trim() })}
                </span>
                <button type="button" onClick={backToPassword} className={cn(linkClass, 'min-h-11 px-2.5 text-xs')}>
                  {t('secondFactor.change')}
                </button>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void submitCode(otp);
                }}
                className="mt-6 flex flex-col gap-5"
              >
                <div className="flex flex-col gap-2">
                  <Label htmlFor="otp">{t('secondFactor.codeLabel')}</Label>
                  <Input
                    ref={otpRef}
                    id="otp"
                    name="otp"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    dir="ltr"
                    value={otp}
                    onChange={(e) => onOtpChange(e.target.value)}
                    aria-invalid={error === 'second-factor-invalid' || error === 'code-incomplete' || undefined}
                    aria-describedby={errorText ? 'otp-error' : undefined}
                    placeholder="••••••"
                    className="h-14 text-center font-mono text-2xl tabular-nums tracking-[0.5em]"
                  />
                </div>

                {errorText && (
                  <div id="otp-error" role="alert" className={ALERT}>
                    <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
                    <p>{errorText}</p>
                  </div>
                )}

                <Button type="submit" loading={busy === 'code'} size="lg" className="h-11 w-full">
                  {t('secondFactor.submit')}
                </Button>
                <button type="button" onClick={backToPassword} className={quietClass}>
                  <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
                  {t('secondFactor.back')}
                </button>
              </form>
            </div>
          )}

          {step === 'demo' && (
            <div key="demo" className="animate-fade-up">
              <span className="inline-flex size-12 items-center justify-center rounded-xl border border-gold-500/30 bg-gold-500/[0.12] text-gold-300">
                <Timer className="size-6" aria-hidden />
              </span>
              <h1 className="mt-5 font-display text-3xl font-semibold tracking-tight">{t('demo.title')}</h1>
              <p className="mt-2 text-sm text-muted-foreground">{t('demo.subtitle')}</p>

              <form onSubmit={submitDemo} className="mt-8 flex flex-col gap-5">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="demo-email">{t('demo.emailLabel')}</Label>
                  <Input
                    ref={demoRef}
                    id="demo-email"
                    type="email"
                    autoComplete="email"
                    dir="ltr"
                    value={demoEmail}
                    onChange={(e) => setDemoEmail(e.target.value)}
                    placeholder={t('emailPlaceholder')}
                    className="h-11 text-base sm:text-sm"
                    required
                  />
                </div>

                {errorText && (
                  <div role="alert" className={ALERT}>
                    <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
                    <p>{errorText}</p>
                  </div>
                )}

                <Button type="submit" loading={busy === 'demo'} size="lg" className="h-11 w-full gap-2">
                  {busy !== 'demo' && <Zap className="size-4" aria-hidden />}
                  {t('demo.start')}
                </Button>
                <p className="text-xs leading-relaxed text-muted-foreground">{t('demo.notice')}</p>
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setStep('credentials');
                  }}
                  className={quietClass}
                >
                  <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
                  {t('demo.back')}
                </button>
              </form>
            </div>
          )}
        </div>

        <footer className="mx-auto flex w-full max-w-[400px] flex-col items-center gap-1 text-center">
          {!orgOpen && step === 'credentials' && (
            <button type="button" onClick={openOrg} className={cn(quietClass, 'px-2 text-xs')}>
              <Building2 className="size-3.5" aria-hidden />
              {t('organizationToggle')}
            </button>
          )}
          <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5 shrink-0" aria-hidden />
            {t('trustNotice')}
          </p>
        </footer>
      </main>
    </div>
  );
}
