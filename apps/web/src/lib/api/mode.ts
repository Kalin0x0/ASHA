/**
 * Data-source mode. `NEXT_PUBLIC_API_MODE` is a build-time constant, so the
 * value is fixed for the lifetime of the bundle — which lets the hooks barrel
 * pick a mock or live implementation at module load without violating the rules
 * of hooks.
 */
export type ApiMode = 'mock' | 'live';

export const API_MODE: ApiMode = process.env.NEXT_PUBLIC_API_MODE === 'live' ? 'live' : 'mock';

/** Absolute base URL of the API, e.g. http://localhost:4000/api/v1 (no trailing slash). */
export const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1').replace(
  /\/+$/,
  '',
);

export const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:4000';

export const isLive = API_MODE === 'live';
