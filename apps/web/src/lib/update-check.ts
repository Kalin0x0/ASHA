'use client';

import { CURRENT_VERSION } from '@/lib/changelog';

export interface UpdateStatus {
  current: string;
  latest: string;
  updateAvailable: boolean;
  /** Whether an update feed URL is configured (NEXT_PUBLIC_UPDATE_FEED_URL). */
  configured: boolean;
  /** Link to the release / download (from the feed), if provided. */
  url?: string;
  notes?: string;
  date?: string;
}

function parts(v: string): number[] {
  return v.replace(/^v/i, '').split(/[.\-+]/).map((n) => Number.parseInt(n, 10) || 0);
}

/** Returns true when semantic version `a` is strictly newer than `b`. */
export function isNewer(a: string, b: string): boolean {
  const pa = parts(a);
  const pb = parts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return false;
}

// Optional update feed: a JSON document like { "version": "1.2.0", "notes": "…",
// "url": "https://…", "date": "2026-…" }. Configure it per-deployment to point at
// wherever you publish releases. Unset → the app reports "you're up to date".
const FEED_URL = process.env.NEXT_PUBLIC_UPDATE_FEED_URL;

/**
 * Check for a newer Asha release. With no feed configured the running build is
 * the source of truth, so we report "up to date". When a feed is configured we
 * fetch it and compare its version to the running one.
 */
export async function checkForUpdates(): Promise<UpdateStatus> {
  const current = CURRENT_VERSION;
  if (!FEED_URL) {
    return { current, latest: current, updateAvailable: false, configured: false };
  }
  const res = await fetch(FEED_URL, { cache: 'no-store', headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`Update check failed (${res.status})`);
  const body = (await res.json()) as Record<string, unknown>;
  const raw = body.version ?? body.latest ?? body.tag_name ?? current;
  const latest = String(raw).replace(/^v/i, '');
  return {
    current,
    latest,
    updateAvailable: isNewer(latest, current),
    configured: true,
    url: typeof body.url === 'string' ? body.url : typeof body.html_url === 'string' ? body.html_url : undefined,
    notes: typeof body.notes === 'string' ? body.notes : typeof body.body === 'string' ? body.body : undefined,
    date: typeof body.date === 'string' ? body.date : undefined,
  };
}
