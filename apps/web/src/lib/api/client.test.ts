import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiFetch } from './client';

/**
 * `fetch` never times out on its own. A request to an API that accepts the
 * socket and then goes quiet — a dead gateway, a dropped VPN, a proxy holding
 * the connection — stays pending for the life of the tab, and every caller
 * awaiting it hangs with it.
 *
 * That is how "End session" became a dead button: the viewer awaited the DELETE
 * (correctly — a fire-and-forget call gets dropped by the navigation that
 * follows), disabled the button for the duration, and then waited forever. No
 * error, no toast, no way back. A bounded wait turns silence into something the
 * user can see and retry.
 */
describe('apiFetch timeouts', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
  });

  /** A fetch that never settles until its abort signal fires. */
  function hangingFetch() {
    const seen: AbortSignal[] = [];
    globalThis.fetch = vi.fn((_url: unknown, init?: { signal?: AbortSignal }) => {
      const signal = init?.signal;
      if (signal) seen.push(signal);
      return new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(signal.reason ?? new Error('aborted')), { once: true });
      });
    }) as unknown as typeof fetch;
    return seen;
  }

  it('gives up on a request that never answers', async () => {
    hangingFetch();
    const pending = apiFetch('/sessions/abc', { method: 'DELETE', auth: false });
    const assertion = expect(pending).rejects.toBeInstanceOf(ApiError);
    await vi.advanceTimersByTimeAsync(30_000);
    await assertion;
  });

  it('reports the timeout as a 408 with a readable message, not a bare AbortError', async () => {
    hangingFetch();
    const pending = apiFetch('/sessions/abc', { method: 'DELETE', auth: false });
    const assertion = pending.catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(30_000);
    const err = (await assertion) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(408);
    // Viewers render `e.message` in the failure toast, so it has to be prose.
    expect(err.message).toMatch(/did not respond/i);
  });

  it('honours a shorter per-call budget', async () => {
    hangingFetch();
    const pending = apiFetch('/sessions/abc/pause', { method: 'POST', auth: false, timeoutMs: 8_000 });
    const assertion = expect(pending).rejects.toMatchObject({ status: 408 });
    await vi.advanceTimersByTimeAsync(8_000);
    await assertion;
  });

  it('still lets a caller abort on its own terms', async () => {
    hangingFetch();
    const ctrl = new AbortController();
    const reason = new Error('caller went away');
    const pending = apiFetch('/sessions', { auth: false, signal: ctrl.signal });
    const assertion = expect(pending).rejects.toBe(reason);
    ctrl.abort(reason);
    await assertion;
  });

  it('does not leave a timer armed after a normal response', async () => {
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 204 })) as unknown as typeof fetch;
    await expect(apiFetch('/sessions/abc', { method: 'DELETE', auth: false })).resolves.toBeUndefined();
    // A leaked 30s timer would keep the event loop (and, in a browser, the tab's
    // timer budget) busy for every request the app ever makes.
    expect(vi.getTimerCount()).toBe(0);
  });
});
