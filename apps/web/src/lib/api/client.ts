'use client';

import {
  type AuthTokens,
  clearAuth,
  getAccessToken,
  getRefreshToken,
  setTokens,
} from './auth-store';
import { API_BASE_URL } from './mode';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Attach the bearer token (default true). Set false for login/refresh. */
  auth?: boolean;
  signal?: AbortSignal;
}

// Single-flight refresh: concurrent 401s share one refresh round-trip.
let refreshing: Promise<boolean> | null = null;

async function refreshTokens(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;
  try {
    const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return false;
    const tokens = (await res.json()) as AuthTokens;
    setTokens(tokens);
    return true;
  } catch {
    return false;
  }
}

async function ensureRefreshed(): Promise<boolean> {
  refreshing ??= refreshTokens().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

async function rawFetch(path: string, opts: RequestOptions, token: string | null): Promise<Response> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  if (opts.auth !== false && token) headers.authorization = `Bearer ${token}`;
  return fetch(`${API_BASE_URL}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });
}

/**
 * Typed API request. Attaches the bearer token, and on a 401 attempts a single
 * token refresh and retries once. A failed refresh clears auth so the app can
 * redirect to login.
 */
export async function apiFetch<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  let res = await rawFetch(path, opts, getAccessToken());

  if (res.status === 401 && opts.auth !== false && getRefreshToken()) {
    const ok = await ensureRefreshed();
    if (ok) {
      res = await rawFetch(path, opts, getAccessToken());
    } else {
      clearAuth();
    }
  }

  if (!res.ok) {
    let body: unknown;
    let message = `${res.status} ${res.statusText}`;
    try {
      body = await res.json();
      const m = (body as { message?: string | string[] })?.message;
      if (m) message = Array.isArray(m) ? m.join(', ') : m;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, message, body);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
