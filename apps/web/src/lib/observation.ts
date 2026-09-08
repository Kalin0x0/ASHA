import type { SessionObservationSample, SessionObservedEvent } from '@asha/events';
import type { SessionRow } from '@/lib/types';

/**
 * The decisions behind the live monitor wall, kept out of the page so the ones
 * that matter — is this frame still live, may this session be watched at all —
 * are testable without a browser.
 */

/** One sample as it travels to the wall: the agent's capture plus its session. */
export type ObservationSample = SessionObservationSample & { sessionId: string };

/** Sampling cadences offered in the header. 0 = metadata only, nothing captured. */
export const OBSERVE_INTERVALS = [3_000, 5_000, 10_000, 0] as const;
export type ObserveInterval = (typeof OBSERVE_INTERVALS)[number];
export const DEFAULT_OBSERVE_INTERVAL: ObserveInterval = 5_000;

/** Thumbnail width asked of the agent; the tile reserves 16:9 at this width. */
export const OBSERVE_THUMB_WIDTH = 320;

/**
 * What the read-only live view asks for instead.
 *
 * A container desktop has no second stream to open — the capture IS the live
 * view — so the same pipe is asked for a full-size frame as fast as the agent
 * can take one. A pass costs roughly 135 ms of docker exec plus the grab, and
 * the agent skips a tick whose predecessor is still running, so asking for two
 * a second costs frames rather than execs when a container cannot keep up.
 *
 * Both numbers are measured on this deployment against a container with a real
 * page on screen, not reasoned from the wall's 320 px frame:
 *
 *   width   time per frame   size
 *   320     482 ms            8.4 KB
 *   640     491 ms           26 KB
 *   960     551 ms           37 KB
 *   1280    640 ms           47 KB
 *
 * 960 px is where the curve turns: the last third of the width buys a quarter
 * more bytes and 90 ms for detail nobody reads off a live view. And a capture
 * takes ~540 ms end to end (ffmpeg plus the exec), so an interval under that
 * only produces passes the agent skips — 700 ms is the honest cadence, near
 * 1.4 frames a second, about 52 kB/s per watched desktop on a ~20 Mbit/s uplink.
 */
export const OBSERVE_LIVE_INTERVAL_MS = 700;
export const OBSERVE_LIVE_THUMB_WIDTH = 960;

/**
 * How long the live view keeps calling a frame current. Generous next to the
 * 700 ms cadence, because a busy container skipping a pass or two is normal and
 * flickering between "live" and "stalled" would say nothing — but far short of
 * the wall's half-minute, because a picture presented as live while the frames
 * have stopped is the one thing this view must not do.
 */
export const LIVE_STALL_MS = 6_000;

/**
 * How often an open window is renewed. The agent stops capturing 60s after the
 * last request it saw, so renewing well inside that keeps the wall alive without
 * re-posting once per frame at the 3s cadence.
 */
export const OBSERVE_RENEW_MS = 20_000;

/**
 * A frame is only shown while the API could plausibly still be holding it (the
 * Redis entry lives 30s). Past that the agent has stopped, the session has ended
 * or the capture never arrived — and a minutes-old desktop presented as "live"
 * is worse than no picture at all.
 */
export const OBSERVATION_MAX_AGE_MS = 30_000;

/**
 * Whether a frame can be taken of this session at all, exactly as the API
 * answered it when the window was opened.
 *
 * The browser must not work this out for itself. A capture needs the agent
 * inside the container, and `connectionType` does not say whether there is one:
 * a container workspace reached over guacd carries the same `RDP`/`VNC` label
 * as a fixed server, and the API captures the first and not the second.
 */
export interface ObservationCapability {
  thumbnails: boolean;
  /** `no_agent`, `capture_disabled` — the machine tokens the API answers with. */
  reason?: string;
}

export function isObservationFresh(sample: ObservationSample, now = Date.now()): boolean {
  const at = Date.parse(sample.capturedAt);
  if (Number.isNaN(at)) return false;
  return now - at < OBSERVATION_MAX_AGE_MS;
}

/** Live, and with somebody at it — the state the API accepts an observation for. */
export function isObservableSession(session: Pick<SessionRow, 'staged' | 'status'>): boolean {
  return !session.staged && (session.status === 'RUNNING' || session.status === 'DEGRADED');
}

/** The sessions a tile may observe: live, and belonging to somebody. */
export function observableSessions(sessions: SessionRow[]): SessionRow[] {
  return sessions.filter(isObservableSession);
}

/**
 * Samples arrive from two places (the socket and the poll) and the socket does
 * not guarantee order, so an older frame must never replace a newer one.
 */
export function mergeObservation(
  current: Record<string, ObservationSample>,
  next: ObservationSample,
): Record<string, ObservationSample> {
  const prev = current[next.sessionId];
  if (prev && Date.parse(prev.capturedAt) > Date.parse(next.capturedAt)) return current;
  return { ...current, [next.sessionId]: next };
}

/**
 * `image` is a bare base64 WebP so the payload stays small on the wire. Mock
 * mode seeds SVG placeholders, which are already data URLs — pass those through
 * rather than prefixing them into a broken `src`.
 */
export function observationImageSrc(image: string | undefined): string | undefined {
  if (!image) return undefined;
  return image.startsWith('data:') ? image : `data:image/webp;base64,${image}`;
}

/**
 * WM_CLASS as xprop prints it — `"navigator", "Google-chrome"` — reduced to the
 * name that identifies the application. The second field is the class; the first
 * is only the instance, and is often just the binary name.
 */
export function formatAppClass(appClass: string | undefined): string | undefined {
  if (!appClass) return undefined;
  const parts = appClass
    .split(',')
    .map((p) => p.trim().replace(/^"|"$/g, '').trim())
    .filter(Boolean);
  const last = parts[parts.length - 1];
  return last ? last.toLowerCase() : undefined;
}

/**
 * The agent reports why a capture came back thin as machine tokens
 * (`missing:ffmpeg`, `timeout`, `image-too-large`, `no-image`,
 * `unsupported:kubernetes`) rather than prose, because prose in the agent would
 * be untranslatable. Turn one into a message key plus the tool it names.
 */
export function degradedReason(degraded: string): { key: string; tool?: string } {
  const first = degraded.split(/[\s,]+/).filter(Boolean)[0] ?? '';
  if (first.startsWith('missing:')) return { key: 'missingTool', tool: first.slice('missing:'.length) };
  if (first.startsWith('unsupported:')) return { key: 'unsupportedDriver' };
  if (first === 'timeout') return { key: 'timeout' };
  if (first === 'image-too-large') return { key: 'tooLarge' };
  if (first === 'no-image') return { key: 'noImage' };
  return { key: 'unknown' };
}

/** Why a tile has no picture — each maps to its own line of copy. */
export type TilePreview =
  | { kind: 'frame'; src: string }
  | { kind: 'blank'; reason: 'unsupported' | 'off' | 'degraded' | 'waiting'; detail?: string };

/**
 * What the tile shows. Capture being off wins over a frame that is still in
 * hand: the header promises that nothing is being captured, and a leftover
 * desktop under that promise would make the header a lie.
 *
 * `capability` is the API's answer for this session; while it is still absent
 * the tile waits rather than guessing, because guessing from the protocol label
 * is what told an agent-backed guacd desktop it could not be captured while the
 * agent was capturing it.
 */
export function resolveTilePreview(args: {
  sample: ObservationSample | undefined;
  capturing: boolean;
  capability: ObservationCapability | undefined;
  now?: number;
}): TilePreview {
  const { sample, capturing, capability, now = Date.now() } = args;
  if (!capturing) return { kind: 'blank', reason: 'off' };
  if (capability && !capability.thumbnails) {
    return { kind: 'blank', reason: capability.reason === 'capture_disabled' ? 'off' : 'unsupported' };
  }
  if (sample && isObservationFresh(sample, now)) {
    const src = observationImageSrc(sample.image);
    if (src) return { kind: 'frame', src };
    if (sample.degraded) return { kind: 'blank', reason: 'degraded', detail: sample.degraded };
  }
  return { kind: 'blank', reason: 'waiting' };
}

/**
 * Why the connection-proxy closed a view socket, when it says so.
 *
 * An expired or revoked grant is not a refusal: the observer may go on
 * watching, they just need a new watch token — and minting one is what re-runs
 * the permission check, the org policy, the notice and the audit entry. The
 * other two are final for this session. Mirrored from
 * apps/connection-proxy/src/proxy.ts and its guacamole/ssh handlers.
 */
export type StreamCloseReason = 'watchExpired' | 'watchRevoked' | 'noLiveConnection' | 'viewUnsupported';

const STREAM_CLOSE_REASONS: Record<number, StreamCloseReason> = {
  4005: 'watchExpired',
  4006: 'watchRevoked',
  4010: 'noLiveConnection',
  4011: 'viewUnsupported',
};

/**
 * The code arrives through guacamole-common-js, which parses the close REASON
 * with `parseInt` — which is why the proxy repeats the number in the text — and
 * hands it on as the status code. Anything else is somebody else's close.
 */
export function streamCloseReason(code: number | undefined): StreamCloseReason | undefined {
  if (typeof code !== 'number' || Number.isNaN(code)) return undefined;
  return STREAM_CLOSE_REASONS[code];
}

/** Can this be answered with a fresh token, or is watching over for now? */
export function isRemintable(reason: StreamCloseReason): boolean {
  return reason === 'watchExpired' || reason === 'watchRevoked';
}

/** Who is watching right now, as `GET /sessions/:id/connection` answers it. */
export interface ObservedByNotice {
  observerName: string;
  since: string;
  observerCount: number;
}

/**
 * The observation banner in a viewer, and how many pushes it has seen.
 *
 * `session.observed` is emitted on the transition only, so a viewer that
 * reloaded — or whose socket dropped — while somebody was already watching has
 * no event to replay and would show nothing for the rest of the observation.
 * It reads the current watcher back from the API instead; the counter is what
 * keeps that read from overwriting a push that landed while it was in flight.
 */
export interface ObservationNoticeState {
  observed: SessionObservedEvent | null;
  pushes: number;
}

export const NO_OBSERVATION_NOTICE: ObservationNoticeState = { observed: null, pushes: 0 };

/** A push is the newest truth, whatever a read in flight is about to say. */
export function applyObservedPush(
  state: ObservationNoticeState,
  event: SessionObservedEvent,
): ObservationNoticeState {
  return { observed: event.active ? event : null, pushes: state.pushes + 1 };
}

/**
 * Apply a notice read back from the API — unless a push overtook it, in which
 * case the read describes a moment that has already passed.
 */
export function applyObservedRead(
  state: ObservationNoticeState,
  sessionId: string,
  observedBy: ObservedByNotice | null | undefined,
  pushesWhenRequested: number,
): ObservationNoticeState {
  if (state.pushes !== pushesWhenRequested) return state;
  const observed = observedBy
    ? { sessionId, observerName: observedBy.observerName, since: observedBy.since, active: true }
    : null;
  return { ...state, observed };
}

/**
 * What the read-only live view is showing at this moment.
 *
 * `stalled` keeps the last frame on screen and says so, rather than blanking:
 * the observer needs to know the picture stopped, and a frozen desktop with no
 * label is exactly the lie the wall's 30 s freshness rule exists to prevent.
 * `degraded` is the sample arriving without a picture in it — a workspace image
 * that ships no ffmpeg — which would otherwise spin forever.
 */
export type LiveViewStatus = 'live' | 'stalled' | 'waiting' | 'degraded' | 'unavailable';

export function resolveLiveView(args: {
  sample: ObservationSample | undefined;
  capability: ObservationCapability | undefined;
  now?: number;
}): { status: LiveViewStatus; src?: string; detail?: string } {
  const { sample, capability, now = Date.now() } = args;
  // The API answered that nothing can be captured here — no agent, or capture
  // switched off org-wide. There is no second stream to fall back to.
  if (capability && !capability.thumbnails) return { status: 'unavailable' };
  const src = observationImageSrc(sample?.image);
  if (src) {
    // An unparseable timestamp reads as stale, which is the honest direction.
    const age = now - Date.parse(sample?.capturedAt ?? '');
    return { status: age < LIVE_STALL_MS ? 'live' : 'stalled', src };
  }
  // The capture came back thin. Workspace images are third-party, so this is a
  // missing helper far more often than it is a fault, and the agent names which.
  if (sample?.degraded) return { status: 'degraded', detail: sample.degraded };
  return { status: 'waiting' };
}

/**
 * Where "watch live" goes, and which hold the viewer will carry.
 *
 * The two kinds cannot share a viewer, and the API says which one it handed out
 * rather than leaving the caller to re-read the connection type: a fixed server
 * streams through the connection-proxy, while a container desktop is watched
 * through the capture the agent is already taking — a page in this app, with no
 * address on the session and no credential of its own.
 *
 * The hold id travels with it because the surface that opened it is about to
 * unmount: the viewer renews and releases the same hold, so the notice never
 * blinks on the way from the tile to the desktop, and a reload of the viewer
 * continues it instead of opening a second one.
 */
export function watchRoute(
  win: { watchKind: 'guac' | 'stream' | 'none'; watchUrl?: string },
  sessionId: string,
  windowId: string,
): string | null {
  const hold = `win=${encodeURIComponent(windowId)}`;
  if (win.watchKind === 'stream') return `/observe/${encodeURIComponent(sessionId)}?${hold}`;
  if (win.watchKind === 'guac' && win.watchUrl) {
    return `${win.watchUrl}${win.watchUrl.includes('?') ? '&' : '?'}${hold}`;
  }
  return null;
}
