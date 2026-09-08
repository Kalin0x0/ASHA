import { describe, expect, it } from 'vitest';
import {
  NO_OBSERVATION_NOTICE,
  type ObservationSample,
  applyObservedPush,
  applyObservedRead,
  formatAppClass,
  isObservableSession,
  isObservationFresh,
  isRemintable,
  mergeObservation,
  observableSessions,
  observationImageSrc,
  resolveLiveView,
  resolveTilePreview,
  streamCloseReason,
  watchRoute,
} from './observation';
import type { SessionRow } from './types';

const NOW = Date.parse('2026-09-08T12:00:00.000Z');

const sample = (over: Partial<ObservationSample> = {}): ObservationSample => ({
  sessionId: 'sess-1',
  kasmId: 'abc123',
  capturedAt: new Date(NOW - 2_000).toISOString(),
  ...over,
});

const session = (over: Partial<SessionRow> = {}): SessionRow => ({
  id: 'sess-1',
  kasmId: 'abc123',
  user: { id: 'u1', name: 'Anna Lindqvist', email: 'anna@asha.local' },
  workspaceName: 'Firefox',
  zone: 'homelab',
  agent: 'agent-01',
  status: 'RUNNING',
  cpuPct: 12,
  memMb: 900,
  memLimitMb: 2768,
  uptimeSec: 600,
  createdAt: new Date(NOW - 600_000).toISOString(),
  connectionType: 'KASMVNC',
  ...over,
});

describe('observableSessions', () => {
  it('keeps live sessions', () => {
    expect(observableSessions([session(), session({ id: 's2', status: 'DEGRADED' })])).toHaveLength(2);
  });

  it('drops sessions nobody is at', () => {
    // A provisioning or paused container has no X display to capture, and a
    // staged one has no user — a tile for either would only ever say "waiting".
    const rows = [session({ status: 'PROVISIONING' }), session({ status: 'PAUSED' }), session({ staged: true })];
    expect(observableSessions(rows)).toEqual([]);
  });
});

describe('isObservableSession', () => {
  it('accepts a live session somebody is at', () => {
    expect(isObservableSession(session())).toBe(true);
    expect(isObservableSession(session({ status: 'DEGRADED' }))).toBe(true);
  });

  it('refuses one nobody is at', () => {
    expect(isObservableSession(session({ status: 'PROVISIONING' }))).toBe(false);
    expect(isObservableSession(session({ staged: true }))).toBe(false);
  });
});

describe('isObservationFresh', () => {
  it('accepts a sample the API could still be holding', () => {
    expect(isObservationFresh(sample(), NOW)).toBe(true);
  });

  it('rejects one past the Redis TTL', () => {
    expect(isObservationFresh(sample({ capturedAt: new Date(NOW - 31_000).toISOString() }), NOW)).toBe(false);
  });

  it('rejects an unparseable timestamp instead of treating it as now', () => {
    expect(isObservationFresh(sample({ capturedAt: 'whenever' }), NOW)).toBe(false);
  });
});

describe('mergeObservation', () => {
  it('takes a newer frame', () => {
    const first = mergeObservation({}, sample());
    const next = sample({ capturedAt: new Date(NOW).toISOString(), title: 'newer' });
    expect(mergeObservation(first, next)['sess-1']?.title).toBe('newer');
  });

  it('ignores one that arrives late', () => {
    // Socket delivery is not ordered. A frame that overtook its successor must
    // not roll the tile backwards.
    const current = mergeObservation({}, sample({ title: 'newer' }));
    const stale = sample({ capturedAt: new Date(NOW - 9_000).toISOString(), title: 'older' });
    expect(mergeObservation(current, stale)).toBe(current);
  });
});

describe('observationImageSrc', () => {
  it('wraps the bare base64 the wire carries', () => {
    expect(observationImageSrc('UklGRg==')).toBe('data:image/webp;base64,UklGRg==');
  });

  it('leaves a data URL alone', () => {
    // Mock mode seeds SVG placeholders that are already data URLs; prefixing
    // them again would produce an <img> that silently renders nothing.
    expect(observationImageSrc('data:image/svg+xml;base64,PHN2Zz4=')).toBe('data:image/svg+xml;base64,PHN2Zz4=');
  });

  it('is undefined when there is no frame', () => {
    expect(observationImageSrc(undefined)).toBeUndefined();
  });
});

describe('formatAppClass', () => {
  it('takes the class, not the instance, out of what xprop prints', () => {
    expect(formatAppClass('"navigator", "Google-chrome"')).toBe('google-chrome');
  });

  it('passes a bare class through', () => {
    expect(formatAppClass('gimp')).toBe('gimp');
  });

  it('is undefined when the helper found nothing', () => {
    expect(formatAppClass('')).toBeUndefined();
    expect(formatAppClass(' , ')).toBeUndefined();
  });
});

describe('resolveTilePreview', () => {
  const captures = { thumbnails: true };

  it('shows the frame while it is live', () => {
    expect(
      resolveTilePreview({ sample: sample({ image: 'UklGRg==' }), capturing: true, capability: captures, now: NOW }),
    ).toEqual({ kind: 'frame', src: 'data:image/webp;base64,UklGRg==' });
  });

  it('says a fixed server cannot be captured at all', () => {
    expect(
      resolveTilePreview({
        sample: sample({ image: 'UklGRg==' }),
        capturing: true,
        capability: { thumbnails: false, reason: 'no_agent' },
        now: NOW,
      }),
    ).toEqual({ kind: 'blank', reason: 'unsupported' });
  });

  it('shows the frame of a guacd session the API does capture', () => {
    // A container workspace reached over guacd carries the RDP label, and the
    // agent captures it like any other container. Deciding from that label told
    // such a tile "no capture on a fixed server" while its frames were arriving.
    expect(
      resolveTilePreview({
        sample: sample({ image: 'UklGRg==' }),
        capturing: true,
        capability: captures,
        now: NOW,
      }),
    ).toEqual({ kind: 'frame', src: 'data:image/webp;base64,UklGRg==' });
  });

  it('waits rather than guessing until the API has answered', () => {
    expect(resolveTilePreview({ sample: undefined, capturing: true, capability: undefined, now: NOW })).toEqual({
      kind: 'blank',
      reason: 'waiting',
    });
  });

  it('hides a frame still in hand once capture is switched off', () => {
    // The header states that nothing is being captured. Leaving the last frame
    // on screen under that statement would make the statement a lie.
    expect(
      resolveTilePreview({ sample: sample({ image: 'UklGRg==' }), capturing: false, capability: captures, now: NOW }),
    ).toEqual({ kind: 'blank', reason: 'off' });
  });

  it('passes on the reason the agent gave when a helper was missing', () => {
    expect(
      resolveTilePreview({
        sample: sample({ degraded: 'ffmpeg not present in image' }),
        capturing: true,
        capability: captures,
        now: NOW,
      }),
    ).toEqual({ kind: 'blank', reason: 'degraded', detail: 'ffmpeg not present in image' });
  });

  it('falls back to waiting once the last frame has expired', () => {
    expect(
      resolveTilePreview({
        sample: sample({ image: 'UklGRg==', capturedAt: new Date(NOW - 45_000).toISOString() }),
        capturing: true,
        capability: captures,
        now: NOW,
      }),
    ).toEqual({ kind: 'blank', reason: 'waiting' });
  });
});

describe('streamCloseReason', () => {
  it('names the codes the proxy closes a view socket with', () => {
    // The proxy mints these so the viewer can tell an ended grant from a
    // refusal and re-mint instead of retrying a token that cannot work.
    // Nothing read them, so every fixed-server observation died at 120s on a
    // generic "the remote connection failed".
    expect(streamCloseReason(4005)).toBe('watchExpired');
    expect(streamCloseReason(4006)).toBe('watchRevoked');
    expect(streamCloseReason(4010)).toBe('noLiveConnection');
    expect(streamCloseReason(4011)).toBe('viewUnsupported');
  });

  it('leaves every other close to the viewer own state machine', () => {
    expect(streamCloseReason(4003)).toBeUndefined();
    expect(streamCloseReason(1006)).toBeUndefined();
    // guacamole-common-js parses the close reason with parseInt, so an empty
    // reason arrives as NaN.
    expect(streamCloseReason(Number.NaN)).toBeUndefined();
    expect(streamCloseReason(undefined)).toBeUndefined();
  });

  it('re-mints an ended grant and gives up on the other two', () => {
    expect(isRemintable('watchExpired')).toBe(true);
    expect(isRemintable('watchRevoked')).toBe(true);
    expect(isRemintable('noLiveConnection')).toBe(false);
    expect(isRemintable('viewUnsupported')).toBe(false);
  });
});

describe('watchRoute', () => {
  it('sends a container desktop to the read-only view, carrying the hold', () => {
    expect(watchRoute({ watchKind: 'stream' }, 'sess-1', 'view-9')).toBe('/observe/sess-1?win=view-9');
  });

  it('puts no session address in front of a container observer', () => {
    // The regression guard for the mechanism this replaces. Three rounds of
    // review ended with a per-session `/observe` route carrying a KasmVNC
    // credential — one that outlived its grant, then one that opened the route
    // that may type, then none at all. The live view is a page in this app.
    const route = watchRoute(
      { watchKind: 'stream', watchUrl: 'https://host/session/kid1/observe/?token=t' },
      'sess-1',
      'view-9',
    );
    expect(route).toBe('/observe/sess-1?win=view-9');
    expect(route).not.toContain('token');
  });

  it('appends the hold to the proxy route the API handed out', () => {
    // Without it the viewer renews and releases the caller's single default
    // hold — the one the wall is also on — so whichever surface unmounts first
    // takes the other's notice down with it.
    expect(watchRoute({ watchKind: 'guac', watchUrl: '/connect/kid1?monitor=1&watch=t' }, 'sess-1', 'view-9')).toBe(
      '/connect/kid1?monitor=1&watch=t&win=view-9',
    );
  });

  it('has nowhere to send an observer the API refused', () => {
    expect(watchRoute({ watchKind: 'none' }, 'sess-1', 'view-9')).toBeNull();
    expect(watchRoute({ watchKind: 'guac' }, 'sess-1', 'view-9')).toBeNull();
  });
});

describe('the observation notice a viewer shows', () => {
  const observedBy = { observerName: 'Anna Lindqvist', since: '2026-09-08T11:58:00.000Z', observerCount: 1 };
  const ended = {
    sessionId: 'sess-1',
    observerName: 'Anna Lindqvist',
    since: observedBy.since,
    active: false,
  };

  it('shows the watcher the API reports on mount', () => {
    // The push happens on the transition only, so a viewer that reloaded
    // mid-observation has no event to replay: it used to show no banner for the
    // rest of it, watched with nothing on screen saying so.
    const state = applyObservedRead(NO_OBSERVATION_NOTICE, 'sess-1', observedBy, 0);
    expect(state.observed).toEqual({
      sessionId: 'sess-1',
      observerName: 'Anna Lindqvist',
      since: observedBy.since,
      active: true,
    });
  });

  it('clears the banner when the API reports nobody', () => {
    const seeded = applyObservedRead(NO_OBSERVATION_NOTICE, 'sess-1', observedBy, 0);
    expect(applyObservedRead(seeded, 'sess-1', null, seeded.pushes).observed).toBeNull();
  });

  it('takes the last observer off the screen on the push that says so', () => {
    const seeded = applyObservedRead(NO_OBSERVATION_NOTICE, 'sess-1', observedBy, 0);
    expect(applyObservedPush(seeded, ended).observed).toBeNull();
  });

  it('does not let a read in flight resurrect an observation that ended', () => {
    // The read was issued before the push landed, so it describes a moment that
    // has passed — applying it would put the banner back up over a desktop
    // nobody is watching any more.
    const stopped = applyObservedPush(NO_OBSERVATION_NOTICE, ended);
    expect(applyObservedRead(stopped, 'sess-1', observedBy, 0)).toBe(stopped);
  });
});

describe('resolveLiveView', () => {
  const capture = { thumbnails: true };

  it('is live while frames keep arriving', () => {
    const view = resolveLiveView({ sample: sample({ image: 'UklGRg==' }), capability: capture, now: NOW });
    expect(view.status).toBe('live');
    expect(view.src).toBe('data:image/webp;base64,UklGRg==');
  });

  it('waits rather than guessing before the first frame', () => {
    expect(resolveLiveView({ sample: undefined, capability: undefined, now: NOW }).status).toBe('waiting');
    // A sample with neither a picture nor a stated reason is still just waiting.
    expect(resolveLiveView({ sample: sample(), capability: capture, now: NOW }).status).toBe('waiting');
  });

  it('names the missing helper instead of spinning forever', () => {
    // A third-party workspace image without ffmpeg reports the sample anyway.
    // Waiting on a frame that can never come tells the observer nothing.
    const view = resolveLiveView({
      sample: sample({ degraded: 'missing:ffmpeg' }),
      capability: capture,
      now: NOW,
    });
    expect(view).toEqual({ status: 'degraded', detail: 'missing:ffmpeg' });
  });

  it('keeps the last frame but says it has stopped', () => {
    // Blanking would lose the only thing the observer has; leaving it unlabelled
    // would present a frozen desktop as a quiet user.
    const stale = sample({ image: 'UklGRg==', capturedAt: new Date(NOW - 30_000).toISOString() });
    const view = resolveLiveView({ sample: stale, capability: capture, now: NOW });
    expect(view.status).toBe('stalled');
    expect(view.src).toBe('data:image/webp;base64,UklGRg==');
  });

  it('reads an unparseable capture time as stale', () => {
    const broken = sample({ image: 'UklGRg==', capturedAt: 'not a date' });
    expect(resolveLiveView({ sample: broken, capability: capture, now: NOW }).status).toBe('stalled');
  });

  it('says so when the API answered that nothing can be captured', () => {
    // There is no second stream to fall back to: this capture is the view.
    const view = resolveLiveView({
      sample: sample({ image: 'UklGRg==' }),
      capability: { thumbnails: false, reason: 'no_agent' },
      now: NOW,
    });
    expect(view.status).toBe('unavailable');
    expect(view.src).toBeUndefined();
  });
});
