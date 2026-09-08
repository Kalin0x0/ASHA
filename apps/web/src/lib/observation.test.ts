import { describe, expect, it } from 'vitest';
import {
  type ObservationSample,
  formatAppClass,
  isObservationFresh,
  isObserveStreamUrl,
  mergeObservation,
  observableSessions,
  observationImageSrc,
  resolveTilePreview,
  supportsCapture,
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

describe('supportsCapture', () => {
  it('is false for the guacd protocols', () => {
    // Fixed servers run no agent; the only route to a frame would be a second
    // RDP logon, which is exactly what observation must never cause.
    for (const p of ['RDP', 'VNC', 'SSH']) expect(supportsCapture(p)).toBe(false);
  });

  it('is true for containers', () => {
    expect(supportsCapture('KASMVNC')).toBe(true);
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
  it('shows the frame while it is live', () => {
    expect(
      resolveTilePreview({ sample: sample({ image: 'UklGRg==' }), capturing: true, connectionType: 'KASMVNC', now: NOW }),
    ).toEqual({ kind: 'frame', src: 'data:image/webp;base64,UklGRg==' });
  });

  it('says a fixed server cannot be captured at all', () => {
    expect(
      resolveTilePreview({ sample: sample({ image: 'UklGRg==' }), capturing: true, connectionType: 'RDP', now: NOW }),
    ).toEqual({ kind: 'blank', reason: 'unsupported' });
  });

  it('hides a frame still in hand once capture is switched off', () => {
    // The header states that nothing is being captured. Leaving the last frame
    // on screen under that statement would make the statement a lie.
    expect(
      resolveTilePreview({ sample: sample({ image: 'UklGRg==' }), capturing: false, connectionType: 'KASMVNC', now: NOW }),
    ).toEqual({ kind: 'blank', reason: 'off' });
  });

  it('passes on the reason the agent gave when a helper was missing', () => {
    expect(
      resolveTilePreview({
        sample: sample({ degraded: 'ffmpeg not present in image' }),
        capturing: true,
        connectionType: 'KASMVNC',
        now: NOW,
      }),
    ).toEqual({ kind: 'blank', reason: 'degraded', detail: 'ffmpeg not present in image' });
  });

  it('falls back to waiting once the last frame has expired', () => {
    expect(
      resolveTilePreview({
        sample: sample({ image: 'UklGRg==', capturedAt: new Date(NOW - 45_000).toISOString() }),
        capturing: true,
        connectionType: 'KASMVNC',
        now: NOW,
      }),
    ).toEqual({ kind: 'blank', reason: 'waiting' });
  });
});

describe('isObserveStreamUrl', () => {
  it('accepts the read-only route the API hands out', () => {
    expect(isObserveStreamUrl('https://asha.example.com/session/kid1/observe/?token=t')).toBe(true);
    expect(isObserveStreamUrl('https://asha.example.com/session/kid1/observe')).toBe(true);
  });

  it('refuses anything that is not that route, because it ends up in an iframe src', () => {
    expect(isObserveStreamUrl('javascript:alert(1)')).toBe(false);
    expect(isObserveStreamUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    expect(isObserveStreamUrl('/session/kid1/observe/')).toBe(false);
    expect(isObserveStreamUrl('')).toBe(false);
  });

  it('refuses the session route itself — that one carries the write credential', () => {
    expect(isObserveStreamUrl('https://asha.example.com/session/kid1/?token=t')).toBe(false);
    expect(isObserveStreamUrl('https://asha.example.com/session/kid1/observe/../?token=t')).toBe(false);
  });
});
