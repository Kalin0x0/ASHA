'use client';

import { ArrowRight, Fingerprint, KeyRound, Network, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Logo } from '@/components/brand/logo';
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

  // Discover enabled SSO providers so the buttons reflect the live config.
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
      // Mock mode: any credentials are accepted.
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
    <div className="glass-strong rounded-2xl p-8 shadow-[var(--shadow-lifted)]">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="relative mb-1">
          <Logo showMark={false} />
          <div className="absolute -inset-3 rounded-full bg-gold-500/5 blur-xl" />
        </div>
        <h1 className="font-display text-2xl font-medium">Welcome back</h1>
        <p className="text-sm text-muted-foreground">Sign in to continue to your workspace</p>
      </div>

      <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email or username</Label>
          <Input
            id="email"
            type="text"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <button type="button" className="text-xs text-gold-300 hover:underline">
              Forgot?
            </button>
          </div>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        <Button type="submit" loading={loading} className="mt-1 w-full">
          {!loading && <ArrowRight className="size-4" />}
          Sign in
        </Button>
      </form>

      <div className="my-6 flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="text-xs text-muted-foreground">or continue with</span>
        <Separator className="flex-1" />
      </div>

      <div className="flex flex-col gap-2">
        {/* Passkey login — always available; uses the email entered above. */}
        <Button variant="secondary" type="button" loading={passkeyLoading} onClick={() => void onPasskey()}>
          {!passkeyLoading && <Fingerprint className="size-4" />}
          Sign in with a passkey
        </Button>

        {/* Live SSO providers when configured; otherwise a placeholder. */}
        {isLive && ssoProviders.filter((p) => p.type !== 'LDAP').length > 0 ? (
          ssoProviders
            .filter((p) => p.type !== 'LDAP')
            .map((p) => (
              <Button
                key={p.id}
                variant="secondary"
                type="button"
                onClick={() => {
                  window.location.href = ssoLoginUrl(p);
                }}
              >
                <Network className="size-4" /> {p.name}
                <span className="text-xs text-muted-foreground">({p.type})</span>
              </Button>
            ))
        ) : (
          <Button variant="secondary" type="button" onClick={() => router.push('/dashboard')}>
            <KeyRound className="size-4" /> SSO / OIDC
          </Button>
        )}
      </div>

      <div className="mt-8 rounded-lg border border-border-subtle bg-[var(--surface-1)]/60 p-3">
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="size-4 shrink-0 text-gold-400" />
          Authorized access only. Activity on this private deployment may be monitored.
        </p>
      </div>
    </div>
  );
}
