'use client';

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from 'react';
import { type AuthUser, clearAuth, getAuth, getRefreshToken, setAuth, setUser, subscribeAuth } from './auth-store';
import * as api from './endpoints';

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (email: string, password: string, totp?: string) => Promise<void>;
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

  const login = useCallback(async (email: string, password: string, totp?: string) => {
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
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout(getRefreshToken());
    } catch {
      /* best effort */
    }
    clearAuth();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, isAuthenticated: Boolean(user), login, logout }),
    [user, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
