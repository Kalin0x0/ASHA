import type { SessionControlCommand } from '@asha/events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createObservationRunner } from './observation.js';

const OBSERVE = (over: Partial<SessionControlCommand> = {}): SessionControlCommand => ({
  sessionId: 's1',
  action: 'OBSERVE_START',
  kasmId: 'k1',
  intervalMs: 5_000,
  ttlMs: 60_000,
  thumbWidth: 320,
  ...over,
});

function runner(capture = vi.fn().mockResolvedValue({ title: 'Terminal', windowCount: 2 })) {
  const publish = vi.fn().mockResolvedValue({ ok: true });
  const onError = vi.fn();
  return { capture, publish, onError, run: createObservationRunner({ capture, publish, onError }) };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('observation runner — the dead-man switch', () => {
  it('captures until the window expires, then stops on its own', async () => {
    // The API renews while an admin has the wall open. If it stops renewing —
    // tab closed, browser killed, API restarted — nothing else will ever tell
    // this agent to stop taking pictures of someone's desktop.
    const { capture, run } = runner();
    run.start(OBSERVE(), 'c1');

    await vi.advanceTimersByTimeAsync(55_000);
    const beforeExpiry = capture.mock.calls.length;
    expect(beforeExpiry).toBeGreaterThan(1);

    await vi.advanceTimersByTimeAsync(120_000);
    expect(capture.mock.calls.length).toBe(beforeExpiry);
  });

  it('pushes the deadline out on renewal', async () => {
    const { capture, run } = runner();
    run.start(OBSERVE(), 'c1');

    await vi.advanceTimersByTimeAsync(30_000);
    expect(run.start(OBSERVE(), 'c1')).toBe(false);

    // Without the renewal the window would have closed at t=60s.
    await vi.advanceTimersByTimeAsync(40_000);
    const afterRenewal = capture.mock.calls.length;

    await vi.advanceTimersByTimeAsync(10_000);
    expect(capture.mock.calls.length).toBeGreaterThan(afterRenewal);
  });

  it('stops immediately on OBSERVE_STOP', async () => {
    const { capture, run } = runner();
    run.start(OBSERVE(), 'c1');
    await vi.advanceTimersByTimeAsync(6_000);
    const captured = capture.mock.calls.length;

    run.stop('s1');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(capture.mock.calls.length).toBe(captured);
  });
});

describe('observation runner — what it captures', () => {
  it('captures the first frame without waiting out an interval', async () => {
    const { capture, run } = runner();
    expect(run.start(OBSERVE(), 'c1')).toBe(true);

    await vi.advanceTimersByTimeAsync(0);
    expect(capture).toHaveBeenCalledWith('c1', { thumbWidth: 320 });
  });

  it('completes the sample with the session it belongs to', async () => {
    const { publish, run } = runner();
    run.start(OBSERVE(), 'c1');
    await vi.advanceTimersByTimeAsync(0);

    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({ kasmId: 'k1', title: 'Terminal', windowCount: 2 }),
    );
    const sample = publish.mock.calls[0][0] as { capturedAt: string };
    expect(Number.isNaN(Date.parse(sample.capturedAt))).toBe(false);
  });

  it('treats interval 0 ("aus") as off rather than as the fastest cadence', async () => {
    const { capture, run } = runner();
    run.start(OBSERVE(), 'c1');
    await vi.advanceTimersByTimeAsync(6_000);
    const captured = capture.mock.calls.length;

    expect(run.start(OBSERVE({ intervalMs: 0 }), 'c1')).toBe(false);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(capture.mock.calls.length).toBe(captured);
  });

  it('clamps a cadence the API never sends back into range', async () => {
    const { capture, run } = runner();
    run.start(OBSERVE({ intervalMs: 5, thumbWidth: 4_000 }), 'c1');
    await vi.advanceTimersByTimeAsync(0);
    expect(capture).toHaveBeenCalledWith('c1', { thumbWidth: 640 });

    // 5 ms would be ~200 execs per second per session; the floor is 1 s.
    await vi.advanceTimersByTimeAsync(900);
    expect(capture).toHaveBeenCalledTimes(1);
  });

  it('does not queue execs behind a capture that outlives its interval', async () => {
    let release: () => void = () => undefined;
    const capture = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve({});
        }),
    );
    const { run } = runner(capture);
    run.start(OBSERVE({ intervalMs: 1_000 }), 'c1');

    await vi.advanceTimersByTimeAsync(4_000);
    expect(capture).toHaveBeenCalledTimes(1);
    release();
  });

  it('ignores a command without a kasmId instead of capturing blind', async () => {
    const { capture, onError, run } = runner();
    expect(run.start(OBSERVE({ kasmId: undefined }), 'c1')).toBe(false);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(capture).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalled();
  });

  it('drops a frame whose window closed while it was being taken', async () => {
    // OBSERVE_STOP (or a destroy) can land mid-exec. By the time the frame
    // arrives the API has emitted session.observed active:false and taken the
    // banner down, so publishing it would put a picture of that desktop on the
    // wall after the person was told nobody is looking.
    let release: (capture: unknown) => void = () => undefined;
    const capture = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const { publish, run } = runner(capture);
    run.start(OBSERVE(), 'c1');
    await vi.advanceTimersByTimeAsync(0);
    expect(capture).toHaveBeenCalledTimes(1);

    run.stop('s1');
    release({ title: 'Terminal' });
    await vi.advanceTimersByTimeAsync(0);

    expect(publish).not.toHaveBeenCalled();
  });

  it('publishes a frame the wall renewed the window for mid-capture', async () => {
    // The wall re-requests every 20 s, which lands in the middle of captures all
    // day long. A renewal is not a close, and dropping those frames would empty
    // the wall it is keeping alive.
    let release: (capture: unknown) => void = () => undefined;
    const capture = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const { publish, run } = runner(capture);
    run.start(OBSERVE(), 'c1');
    await vi.advanceTimersByTimeAsync(0);

    run.start(OBSERVE(), 'c1');
    release({ title: 'Terminal' });
    await vi.advanceTimersByTimeAsync(0);

    expect(publish).toHaveBeenCalledWith(expect.objectContaining({ kasmId: 'k1', title: 'Terminal' }));
  });

  it('keeps the window open when one capture fails', async () => {
    const capture = vi
      .fn()
      .mockRejectedValueOnce(new Error('container busy'))
      .mockResolvedValue({ title: 'Terminal' });
    const { onError, publish, run } = runner(capture);
    run.start(OBSERVE(), 'c1');

    await vi.advanceTimersByTimeAsync(6_000);
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('container busy'));
    expect(publish).toHaveBeenCalled();
  });
});
