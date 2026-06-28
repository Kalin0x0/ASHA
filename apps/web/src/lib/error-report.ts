'use client';

import { ingestClientError } from '@/lib/api/endpoints';
import { isLive } from '@/lib/api/mode';
import { store } from '@/lib/mock/store';
import type { ClientErrorInput } from '@/lib/types';

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? '0.1.0';

// Session-local dedupe so a render-loop crash doesn't spam the intake.
const seen = new Set<string>();

/**
 * Best-effort: send an automatically-captured client error to the central
 * intake. In live mode it POSTs to the API (which dedupes + fingerprints); in
 * mock mode it folds into the in-memory store so the admin pages still react.
 * Never throws — reporting must not become a second failure.
 */
export function reportClientError(input: ClientErrorInput): void {
  if (typeof window === 'undefined') return;
  const key = `${input.component ?? 'web'}|${input.errorName ?? ''}|${input.message}`.slice(0, 200);
  if (seen.has(key)) return;
  seen.add(key);

  const payload: ClientErrorInput = {
    ...input,
    component: input.component ?? 'web',
    route: input.route ?? window.location.pathname,
  };
  try {
    if (isLive) {
      void ingestClientError({ ...payload, appVersion: APP_VERSION }).catch(() => undefined);
    } else {
      store.ingestBug(payload);
    }
  } catch {
    /* swallow — never let reporting throw */
  }
}
