import type { SessionControlCommand, SessionObservationSample } from '@asha/events';

/**
 * One capture pass, without the parts the runner owns (which session, when).
 * The drivers return this; the runner completes it into the wire sample.
 */
export type ObservationCapture = Omit<SessionObservationSample, 'kasmId' | 'capturedAt'>;

const DEFAULT_INTERVAL_MS = 5_000;
// The wall asks for one frame every few seconds; the read-only live view asks
// for as many as the container can give, because for a container desktop this
// capture IS the picture. A pass costs ~135 ms of docker exec plus the grab
// itself, so the floor is the point below which the request would only ever be
// skipped by the busy guard in tick().
const MIN_INTERVAL_MS = 500;
const MAX_INTERVAL_MS = 60_000;
const DEFAULT_TTL_MS = 60_000;
const MIN_TTL_MS = 5_000;
const MAX_TTL_MS = 600_000;
const DEFAULT_THUMB_WIDTH = 320;
const MIN_THUMB_WIDTH = 160;
// The ceiling the live view asks for. Kept in step with startObservationSchema
// and with clampThumbWidth in the drivers: a width past what the wire contract
// carries would only produce frames the manager rejects.
const MAX_THUMB_WIDTH = 1280;

export interface ObservationRunnerDeps {
  capture(containerIdOrName: string, opts: { thumbWidth: number }): Promise<ObservationCapture>;
  publish(sample: SessionObservationSample): Promise<unknown>;
  onError?(message: string): void;
}

export interface ObservationRunner {
  /** Opens or renews a window; true when capture was not already running. */
  start(cmd: SessionControlCommand, containerIdOrName: string): boolean;
  stop(sessionId: string): void;
}

interface ObservationWindow {
  kasmId: string;
  containerIdOrName: string;
  intervalMs: number;
  thumbWidth: number;
  /** Wall-clock deadline; the window closes itself once it passes. */
  expiresAt: number;
  timer: NodeJS.Timeout;
  busy: boolean;
}

function bounded(value: number | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/**
 * Demand-driven capture: the API opens a window per observed session and renews
 * it while an admin has the wall open. Nothing here is fire-and-forget — every
 * window carries a deadline it enforces itself, so a closed browser tab (or an
 * API that dies before it sends OBSERVE_STOP) can never leave an agent taking
 * screenshots of someone's desktop.
 */
export function createObservationRunner(deps: ObservationRunnerDeps): ObservationRunner {
  const windows = new Map<string, ObservationWindow>();

  function stop(sessionId: string): void {
    const window = windows.get(sessionId);
    if (!window) return;
    clearInterval(window.timer);
    windows.delete(sessionId);
  }

  async function tick(sessionId: string): Promise<void> {
    const window = windows.get(sessionId);
    if (!window) return;
    if (Date.now() >= window.expiresAt) {
      stop(sessionId);
      return;
    }
    // A capture that outlives its interval (wedged container, slow ffmpeg) must
    // not queue up execs behind itself.
    if (window.busy) return;
    window.busy = true;
    try {
      const capture = await deps.capture(window.containerIdOrName, { thumbWidth: window.thumbWidth });
      // The window can close while the exec runs — OBSERVE_STOP, the deadline,
      // or the container being destroyed. By then the API has told the watched
      // person that observation ended and taken their banner down, so this
      // frame would put a picture of their desktop on the wall after the notice
      // said nobody is looking. A renewal keeps the same window object; only a
      // stop replaces it.
      if (windows.get(sessionId) !== window || Date.now() >= window.expiresAt) return;
      await deps.publish({ ...capture, kasmId: window.kasmId, capturedAt: new Date().toISOString() });
    } catch (e) {
      deps.onError?.(`observation capture for ${sessionId} failed: ${(e as Error).message}`);
    } finally {
      window.busy = false;
    }
  }

  return {
    start(cmd, containerIdOrName) {
      if (!cmd.kasmId) {
        deps.onError?.(`observe start for ${cmd.sessionId} carries no kasmId — ignoring`);
        return false;
      }
      // "aus" in the interval selector: metadata only, so nothing to capture.
      // Bounding 0 up to the minimum would do the exact opposite.
      if (cmd.intervalMs === 0) {
        stop(cmd.sessionId);
        return false;
      }
      const intervalMs = bounded(cmd.intervalMs, DEFAULT_INTERVAL_MS, MIN_INTERVAL_MS, MAX_INTERVAL_MS);
      const thumbWidth = bounded(cmd.thumbWidth, DEFAULT_THUMB_WIDTH, MIN_THUMB_WIDTH, MAX_THUMB_WIDTH);
      const expiresAt = Date.now() + bounded(cmd.ttlMs, DEFAULT_TTL_MS, MIN_TTL_MS, MAX_TTL_MS);

      const existing = windows.get(cmd.sessionId);
      if (existing) {
        existing.expiresAt = expiresAt;
        existing.thumbWidth = thumbWidth;
        existing.containerIdOrName = containerIdOrName;
        existing.kasmId = cmd.kasmId;
        if (existing.intervalMs !== intervalMs) {
          clearInterval(existing.timer);
          existing.intervalMs = intervalMs;
          existing.timer = setInterval(() => void tick(cmd.sessionId), intervalMs);
        }
        return false;
      }

      const window: ObservationWindow = {
        kasmId: cmd.kasmId,
        containerIdOrName,
        intervalMs,
        thumbWidth,
        expiresAt,
        timer: setInterval(() => void tick(cmd.sessionId), intervalMs),
        busy: false,
      };
      windows.set(cmd.sessionId, window);
      // The admin opening the wall wants a tile now, not one interval from now.
      void tick(cmd.sessionId);
      return true;
    },

    stop,
  };
}
