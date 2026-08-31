import { describe, expect, it } from 'vitest';
import { planSessionExit } from './session-exit';

describe('planSessionExit', () => {
  it('terminates server-side when live and the session id is known', () => {
    expect(planSessionExit({ live: true, sessionId: 'sess_1' })).toEqual({
      action: 'terminate',
      sessionId: 'sess_1',
    });
  });

  it('never silently skips the terminate call when the id is missing', () => {
    // The regression: `if (session?.id)` treated an unresolved session as
    // "nothing to end" and navigated away with the desktop still running.
    for (const sessionId of [undefined, null, '', '   ']) {
      expect(planSessionExit({ live: true, sessionId })).toEqual({ action: 'unresolved' });
    }
  });

  it('does not call the API in mock mode', () => {
    expect(planSessionExit({ live: false, sessionId: 'sess_1' })).toEqual({ action: 'local-only' });
    expect(planSessionExit({ live: false })).toEqual({ action: 'local-only' });
  });
});
