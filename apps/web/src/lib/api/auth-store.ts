'use client';

/**
 * Token + user persistence for live mode. Holds the JWT pair and the current
 * user in localStorage, with a tiny pub/sub so the auth context and the fetch
 * client share one source of truth. SSR-safe: all storage access is guarded.
 */

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  displayName: string | null;
  orgId: string;
  isSystemAdmin: boolean;
  groups?: string[];
  permissions?: string[];
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
}

interface AuthState {
  tokens: AuthTokens | null;
  user: AuthUser | null;
}

const STORAGE_KEY = 'chista.auth.v1';

let state: AuthState = { tokens: null, user: null };
let hydrated = false;
const listeners = new Set<() => void>();

function hydrate(): void {
  if (hydrated || typeof window === 'undefined') return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) state = JSON.parse(raw) as AuthState;
  } catch {
    state = { tokens: null, user: null };
  }
}

function persist(): void {
  if (typeof window === 'undefined') return;
  try {
    if (state.tokens) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable (private mode); state stays in memory */
  }
}

function emit(): void {
  for (const l of listeners) l();
}

export function getAuth(): AuthState {
  hydrate();
  return state;
}

export function getAccessToken(): string | null {
  return getAuth().tokens?.accessToken ?? null;
}

export function getRefreshToken(): string | null {
  return getAuth().tokens?.refreshToken ?? null;
}

export function setAuth(tokens: AuthTokens, user: AuthUser): void {
  state = { tokens, user };
  persist();
  emit();
}

/** Update tokens after a refresh, keeping the existing user. */
export function setTokens(tokens: AuthTokens): void {
  state = { ...state, tokens };
  persist();
  emit();
}

export function setUser(user: AuthUser): void {
  state = { ...state, user };
  persist();
  emit();
}

export function clearAuth(): void {
  state = { tokens: null, user: null };
  persist();
  emit();
}

export function subscribeAuth(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
