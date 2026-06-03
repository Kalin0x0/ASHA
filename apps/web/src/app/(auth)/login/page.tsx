'use client';

import { ArrowRight, Fingerprint, KeyRound, Network, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ChistaMark } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/lib/api/auth-context';
import {
  type ApiPublicAuthProvider,
  getPublicAuthProviders,
  ssoLoginUrl,
} from '@/lib/api/endpoints';
import { isLive } from '@/lib/api/mode';

export default function LoginPage() {
  const router = useRouter();
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
      router.push('/dashboard');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Sign in failed');
      setLoading(false);
    }
  };

  const onPasskey = async () => {
    if (!isLive) {
      router.push('/dashboard');
      return;
    }
    if (!email) {
      toast.error('Enter your email first, then use your passkey');
      return;
    }
    setPasskeyLoading(true);
    try {
      await loginWithPasskey(email);
      router.push('/dashboard');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Passkey sign in failed');
    } finally {
      setPasskeyLoading(false);
    }
  };

  return (
    <div className="w-full">
      {/* Logo + heading */}
      <div className="mb-8 flex flex-col items-center gap-3 text-center animate-fade-up">
        <div className="relative">
          <div className="absolute -inset-4 rounded-full bg-gold-500/8 blur-2xl animate-float" />
          <div className="relative flex size-16 items-center justify-center rounded-2xl border border-[rgba(212,175,55,0.3)] bg-[var(--surface-1)] shadow-[0_0_40px_-8px_rgba(212,175,55,0.3)]">
            <ChistaMark className="size-12 rounded-2xl" />
          </div>
        </div>
        <div className="space-y-1">
          <h1 className="font-display text-3xl font-medium tracking-tight">Welcome back</h1>
          <p className="text-sm text-muted-foreground">Sign in to your Chista workspace</p>
        </div>
      </div>

      {/* Card */}
      <div className="grad-border-gold rounded-2xl bg-[color-mix(in_srgb,var(--surface-2)_90%,transparent)] shadow-[var(--shadow-lifted)] backdrop-blur-xl animate-fade-up delay-100">
        <div className="p-7">
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email or username</Label>
              <Input
                id="email"
                type="text"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <button type="button" className="text-xs text-gold-300 hover:text-gold-200 transition-colors hover:underline">
                  Forgot password?
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
              Sign in
            </Button>
          </form>

          <div className="my-5 flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">or</span>
            <Separator className="flex-1" />
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
              <span>Sign in with a passkey</span>
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
                <span>SSO / OIDC</span>
              </Button>
            )}
          </div>
        </div>

        {/* Footer trust strip */}
        <div className="flex items-center gap-2.5 rounded-b-2xl border-t border-border-subtle bg-[var(--surface-1)]/40 px-5 py-3">
          <ShieldCheck className="size-4 shrink-0 text-gold-400" />
          <p className="text-xs text-muted-foreground">
            Authorized access only. Activity may be monitored.
          </p>
        </div>
      </div>
    </div>
  );
}
