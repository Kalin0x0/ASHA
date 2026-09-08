import type { SessionObservationSample } from '@asha/events';
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
 * Sessions reached over guacd run on fixed servers, where no agent runs and the
 * only route to a frame would be a second RDP logon — which is exactly what must
 * not happen. Their tiles stay metadata-only.
 */
const CAPTURE_UNSUPPORTED_PROTOCOLS = new Set(['RDP', 'VNC', 'SSH']);

export function supportsCapture(connectionType: string): boolean {
  return !CAPTURE_UNSUPPORTED_PROTOCOLS.has(connectionType);
}

export function isObservationFresh(sample: ObservationSample, now = Date.now()): boolean {
  const at = Date.parse(sample.capturedAt);
  if (Number.isNaN(at)) return false;
  return now - at < OBSERVATION_MAX_AGE_MS;
}

/** The sessions a tile may observe: live, and belonging to somebody. */
export function observableSessions(sessions: SessionRow[]): SessionRow[] {
  return sessions.filter((s) => !s.staged && (s.status === 'RUNNING' || s.status === 'DEGRADED'));
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
 */
export function resolveTilePreview(args: {
  sample: ObservationSample | undefined;
  capturing: boolean;
  connectionType: string;
  now?: number;
}): TilePreview {
  const { sample, capturing, connectionType, now = Date.now() } = args;
  if (!supportsCapture(connectionType)) return { kind: 'blank', reason: 'unsupported' };
  if (!capturing) return { kind: 'blank', reason: 'off' };
  if (sample && isObservationFresh(sample, now)) {
    const src = observationImageSrc(sample.image);
    if (src) return { kind: 'frame', src };
    if (sample.degraded) return { kind: 'blank', reason: 'degraded', detail: sample.degraded };
  }
  return { kind: 'blank', reason: 'waiting' };
}
