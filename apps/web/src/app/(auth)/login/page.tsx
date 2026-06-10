'use client';

import { ArrowRight, Fingerprint, KeyRound, Network, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { ChistaMark } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/lib/api/auth-context';
import { getAuth } from '@/lib/api/auth-store';
import {
  type ApiPublicAuthProvider,
  getPublicAuthProviders,
  ssoLoginUrl,
} from '@/lib/api/endpoints';
import { isLive } from '@/lib/api/mode';

export default function LoginPage() {
  const router = useRouter();
  const t = useTranslations('auth');
  const { login, loginWithPasskey } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [ssoProviders, setSsoProviders] = useState<ApiPublicAuthProvider[]>([]);

  useEffect(() => {
    if (!isLive) return;
    getPublicAuthProviders()
      .then(setSsoProviders)
      .catch(() => setSsoProviders([]));
  }, []);

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
    <div className="w-full">
      {/* Logo + heading */}
      <div className="mb-8 flex flex-col items-center gap-3 text-center animate-fade-up">
        <div className="relative">
          <div className="absolute -inset-6 rounded-full bg-gold-500/10 blur-3xl animate-float" />
          <div className="relative flex size-24 items-center justify-center">
            <ChistaMark className="size-24 rounded-3xl" />
          </div>
        </div>
        <div className="space-y-1">
          <h1 className="font-display text-3xl font-medium tracking-tight">
            {t.rich('welcome', {
              gold: (chunks) => <span className="text-gradient-gold">{chunks}</span>,
            })}
          </h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
      </div>

      {/* Card */}
      <div className="grad-border-gold rounded-2xl bg-[color-mix(in_srgb,var(--surface-2)_90%,transparent)] shadow-[var(--shadow-lifted)] backdrop-blur-xl animate-fade-up delay-100">
        <div className="p-7">
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
                <button type="button" className="text-xs text-gold-300 hover:text-gold-200 transition-colors hover:underline">
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

            <Button type="submit" loading={loading} className="mt-2 h-11 w-full text-sm font-medium">
              {!loading && <ArrowRight className="size-4" />}
              {t('signIn')}
            </Button>
          </form>

          <div className="my-5 flex items-center gap-3">
            <Separator className="flex-1 opacity-50" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/50">{t('orContinueWith')}</span>
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
                    onClick={() => { window.location.href = ssoLoginUrl(p); }}
                  >
                    <Network className="size-4 text-info-400" />
                    <span>{p.name}</span>
                    <span className="ml-auto text-[10px] text-muted-foreground">{p.type}</span>
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
        </div>

        {/* Footer trust strip */}
        <div className="flex items-center gap-2.5 rounded-b-2xl border-t border-border-subtle bg-[var(--surface-1)]/40 px-5 py-3">
          <ShieldCheck className="size-4 shrink-0 text-gold-400" />
          <p className="text-xs text-muted-foreground">
            {t('trustNotice')}
          </p>
        </div>
      </div>
    </div>
  );
}
