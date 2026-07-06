'use client';

import { ArrowRight, Fingerprint, KeyRound, Network, ShieldCheck, Timer, Zap } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { AshaMark } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/lib/api/auth-context';
import { getAuth } from '@/lib/api/auth-store';
import {
  type ApiPublicAuthProvider,
  getDemoConfig,
  getPublicAuthProviders,
  ssoLoginUrl,
} from '@/lib/api/endpoints';
import { isLive } from '@/lib/api/mode';
import { computeDeviceFingerprint } from '@/lib/device-fingerprint';

const SHOWCASE_FEATURES = [
  { Icon: ShieldCheck, key: 'zeroTrust' },
  { Icon: Zap, key: 'fast' },
  { Icon: KeyRound, key: 'passwordless' },
] as const;

export default function LoginPage() {
  const router = useRouter();
  const t = useTranslations('auth');
  const { login, loginWithPasskey, loginAsDemo } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoEnabled, setDemoEnabled] = useState(false);
  const [ssoProviders, setSsoProviders] = useState<ApiPublicAuthProvider[]>([]);

  useEffect(() => {
    if (!isLive) return;
    getPublicAuthProviders()
      .then(setSsoProviders)
      .catch(() => setSsoProviders([]));
    getDemoConfig()
      .then((c) => setDemoEnabled(c.enabled))
      .catch(() => setDemoEnabled(false));
  }, []);

  const onDemo = async () => {
    if (!isLive) {
      router.push('/');
      return;
    }
    if (!email) {
      toast.error(t('errors.enterEmailFirst'));
      return;
    }
    setDemoLoading(true);
    try {
      await loginAsDemo(email, computeDeviceFingerprint());
      router.push('/');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('errors.demoFailed'));
      setDemoLoading(false);
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    if (!isLive) {
      setTimeout(() => router.push('/dashboard'), 650);
      return;
    }
    try {
      await login(email, password);
      router.push(getAuth().user?.isSystemAdmin ? '/dashboard' : '/');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('errors.signInFailed'));
      setLoading(false);
    }
  };

  const onPasskey = async () => {
    if (!isLive) {
      router.push('/dashboard');
      return;
    }
    if (!email) {
      toast.error(t('errors.enterEmailFirst'));
      return;
    }
    setPasskeyLoading(true);
    try {
      await loginWithPasskey(email);
      router.push(getAuth().user?.isSystemAdmin ? '/dashboard' : '/');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('errors.passkeyFailed'));
    } finally {
      setPasskeyLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full bg-anthracite-950">
      {/* ── Showcase panel (cinematic) — hidden on narrow viewports ─────── */}
      <aside className="relative hidden flex-[1.1] flex-col justify-between overflow-hidden p-12 md:flex lg:p-[52px]">
        {/* Forest photo */}
        <div
          aria-hidden
          className="absolute inset-0 scale-[1.04] bg-cover bg-center"
          style={{ backgroundImage: "url('/backgrounds/nature-forest.jpg')" }}
        />
        {/* Anthracite + gold cinematic grade */}
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
        {/* Gold hairline divider on the seam */}
        <div
          aria-hidden
          className="absolute inset-y-0 end-0 w-px"
          style={{ background: 'linear-gradient(180deg, transparent, rgba(212,175,55,0.5), transparent)' }}
        />

        {/* Brand lockup */}
        <div className="relative flex items-center gap-3.5">
          <AshaMark className="size-[52px] rounded-2xl shadow-[0_8px_24px_-6px_rgba(0,0,0,0.6)]" />
          <span className="font-display text-[26px] font-semibold tracking-[0.06em] text-white">ASHA</span>
        </div>

        {/* Headline + feature list */}
        <div className="relative max-w-[460px]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold-300">
            {t('showcase.eyebrow')}
          </p>
          <h2 className="mt-3.5 font-display text-[2.5rem] font-semibold leading-[1.08] tracking-[-0.03em] text-white text-balance">
            {t.rich('showcase.headline', {
              gold: (chunks) => <span className="text-gradient-gold">{chunks}</span>,
            })}
          </h2>
          <div className="mt-7 flex flex-col gap-4">
            {SHOWCASE_FEATURES.map(({ Icon, key }) => (
              <div key={key} className="flex items-start gap-3.5">
                <span className="inline-flex size-[34px] shrink-0 items-center justify-center rounded-[10px] border border-gold-500/30 bg-gold-500/[0.14] text-gold-300">
                  <Icon className="size-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">{t(`showcase.features.${key}.title`)}</p>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-white/75">
                    {t(`showcase.features.${key}.body`)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer note */}
        <div className="relative text-xs text-white/60">{t('showcase.footer')}</div>
      </aside>

      {/* ── Sign-in panel ──────────────────────────────────────────────── */}
      <main className="bg-aurora relative flex flex-1 items-center justify-center p-6 sm:p-10 md:min-w-[400px] md:flex-[0.9]">
        <div className="w-[380px] max-w-full animate-fade-up">
          <div className="mb-6">
            <h1 className="font-display text-3xl font-semibold tracking-tight">
              {t.rich('welcome', {
                gold: (chunks) => <span className="text-gradient-gold">{chunks}</span>,
              })}
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">{t('subtitle')}</p>
          </div>

          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">{t('emailLabel')}</Label>
              <Input
                id="email"
                type="text"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('emailPlaceholder')}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">{t('passwordLabel')}</Label>
                <button type="button" className="text-xs text-gold-300 transition-colors hover:text-gold-200 hover:underline ring-gold-focus rounded">
                  {t('forgotPassword')}
                </button>
              </div>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••"
                required
              />
            </div>

            <Button type="submit" loading={loading} size="lg" className="mt-1 w-full gap-2">
              {!loading && <ArrowRight className="size-4 rtl:rotate-180" />}
              {t('signIn')}
            </Button>
          </form>

          <div className="my-5 flex items-center gap-3">
            <Separator className="flex-1 opacity-50" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/50">
              {t('orContinueWith')}
            </span>
            <Separator className="flex-1 opacity-50" />
          </div>

          <div className="flex flex-col gap-2.5">
            <Button
              variant="secondary"
              type="button"
              loading={passkeyLoading}
              onClick={() => void onPasskey()}
              className="h-10 w-full justify-start gap-3 border border-border-subtle"
            >
              {!passkeyLoading && <Fingerprint className="size-4 text-gold-300" />}
              <span>{t('passkey')}</span>
            </Button>

            {isLive && ssoProviders.filter((p) => p.type !== 'LDAP').length > 0 ? (
              ssoProviders
                .filter((p) => p.type !== 'LDAP')
                .map((p) => (
                  <Button
                    key={p.id}
                    variant="secondary"
                    type="button"
                    className="h-10 w-full justify-start gap-3 border border-border-subtle"
                    onClick={() => {
                      window.location.href = ssoLoginUrl(p);
                    }}
                  >
                    <Network className="size-4 text-info-400" />
                    <span>{p.name}</span>
                    <span className="ms-auto text-[10px] text-muted-foreground">{p.type}</span>
                  </Button>
                ))
            ) : (
              <Button
                variant="secondary"
                type="button"
                className="h-10 w-full justify-start gap-3 border border-border-subtle"
                onClick={() => router.push('/dashboard')}
              >
                <KeyRound className="size-4 text-info-400" />
                <span>{t('sso')}</span>
              </Button>
            )}
          </div>

          {(demoEnabled || !isLive) && (
            <div className="mt-5 rounded-[var(--radius-md)] border border-gold-500/30 bg-gold-500/[0.06] p-3.5">
              <div className="flex items-center gap-2">
                <Timer className="size-4 text-gold-300" />
                <p className="text-sm font-semibold">{t('demo.title')}</p>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{t('demo.subtitle')}</p>
              <Button
                variant="secondary"
                type="button"
                loading={demoLoading}
                onClick={() => void onDemo()}
                className="mt-3 h-10 w-full gap-2 border border-gold-500/40"
              >
                {!demoLoading && <Zap className="size-4 text-gold-300" />}
                <span>{t('demo.start')}</span>
              </Button>
              <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground/80">{t('demo.notice')}</p>
            </div>
          )}

          <div className="mt-6 flex items-center gap-2.5 rounded-[var(--radius-md)] border border-border-subtle bg-[color-mix(in_srgb,var(--surface-1)_50%,transparent)] px-3.5 py-3">
            <ShieldCheck className="size-4 shrink-0 text-gold-400" />
            <p className="text-xs text-muted-foreground">{t('trustNotice')}</p>
          </div>
        </div>
      </main>
    </div>
  );
}
