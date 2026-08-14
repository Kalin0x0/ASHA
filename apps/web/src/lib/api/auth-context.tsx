'use client';

import { startAuthentication } from '@simplewebauthn/browser';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from 'react';
import { type AuthUser, clearAuth, getAuth, getRefreshToken, setAuth, setUser, subscribeAuth } from './auth-store';
import * as api from './endpoints';

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (email: string, password: string, totp?: string) => Promise<void>;
  loginWithPasskey: (email: string) => Promise<void>;
  loginAsDemo: (email: string, fingerprint: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function useAuthUser(): AuthUser | null {
  return useSyncExternalStore(
    subscribeAuth,
    () => getAuth().user,
    () => null,
  );
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const user = useAuthUser();
  // One QueryClient lives above this provider for the life of the tab, so its
  // cache outlives a sign-out: without dropping it, the next person to sign in
  // on this browser is served the previous account's — and, on a shared
  // machine, the previous tenant's — users, sessions and activity from cache
  // before their own data arrives (and instead of it, if their refetch 403s).
  const queryClient = useQueryClient();

  const login = useCallback(async (email: string, password: string, totp?: string) => {
    // Also on the way IN: a tab can switch accounts without a clean sign-out.
    queryClient.clear();
    const res = await api.login({ email, password, totp });
    setAuth(
      { accessToken: res.accessToken, refreshToken: res.refreshToken, expiresIn: res.expiresIn, tokenType: res.tokenType },
      res.user,
    );
    // Enrich with groups + permissions; non-fatal if it fails.
    try {
      setUser(await api.getMe());
    } catch {
      /* keep the basic user from login */
    }
  }, [queryClient]);

  const loginWithPasskey = useCallback(async (email: string) => {
    queryClient.clear();
    // 1. Ask the API for a challenge + allowed credentials.
    const options = await api.getPasskeyLoginOptions(email);
    // 2. Let the authenticator sign it.
    const response = await startAuthentication({ optionsJSON: options as never });
    // 3. Verify server-side and receive a session.
    const res = await api.verifyPasskeyLogin(email, response);
    setAuth(
      { accessToken: res.accessToken, refreshToken: res.refreshToken, expiresIn: res.expiresIn, tokenType: res.tokenType },
      res.user,
    );
    try {
      setUser(await api.getMe());
    } catch {
      /* keep the basic user from login */
    }
  }, [queryClient]);

  const loginAsDemo = useCallback(async (email: string, fingerprint: string) => {
    queryClient.clear();
    const res = await api.loginAsDemo({ email, fingerprint });
    // Demo tokens carry no refresh token — store an empty one; the session simply
    // expires when the 10-minute access token does.
    setAuth(
      { accessToken: res.accessToken, refreshToken: res.refreshToken ?? '', expiresIn: res.expiresIn, tokenType: res.tokenType },
      res.user,
    );
    try {
      setUser(await api.getMe());
    } catch {
      /* keep the basic demo user */
    }
  }, [queryClient]);

  const logout = useCallback(async () => {
    try {
      await api.logout(getRefreshToken());
    } catch {
      /* best effort */
    }
    clearAuth();
    queryClient.clear();
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, isAuthenticated: Boolean(user), login, loginWithPasskey, loginAsDemo, logout }),
    [user, login, loginWithPasskey, loginAsDemo, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
