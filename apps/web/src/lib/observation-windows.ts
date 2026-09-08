/**
 * Which observation windows the live wall still owns.
 *
 * A window is not bookkeeping: it is what puts the notice on the watched
 * person's screen, and closing one writes `observation.stop` into the audit
 * trail. The wall opens and closes them from three places — the filter
 * changing, the renew timer, and its own unmount — and one of those unmounts
 * happens on the way to the live viewer, which must not take the window with
 * it. Kept out of the page so those rules can be tested without a browser.
 */
export interface ObservationWindows {
  /** Reconciles the open windows against the tiles on screen. */
  sync(wanted: readonly string[]): { open: string[]; close: string[] };
  /** The windows to re-request before the agent's dead-man switch fires. */
  renew(): string[];
  /** Passes a window to the viewer being opened; the wall stops touching it. */
  handOff(sessionId: string): void;
  /** Leaving the wall: every window still ours, and it owns none afterwards. */
  release(): string[];
}

export function createObservationWindows(): ObservationWindows {
  const ours = new Set<string>();
  // Never reopened and never closed here. The viewer renews the window for as
  // long as it is watching and closes it when it is left, so the notice tracks
  // the stream rather than the thumbnail — closing it from here would take the
  // banner down at the moment full-screen watching begins.
  const handedOff = new Set<string>();

  return {
    sync(wanted) {
      const next = new Set(wanted);
      const close: string[] = [];
      for (const id of ours) {
        if (next.has(id)) continue;
        ours.delete(id);
        close.push(id);
      }
      // Every wanted tile is (re)opened, not only the new ones: the agent takes
      // its cadence from the last request it saw, so a changed interval has to
      // reach the sessions that were already being captured.
      const open: string[] = [];
      for (const id of next) {
        if (handedOff.has(id)) continue;
        ours.add(id);
        open.push(id);
      }
      return { open, close };
    },

    renew() {
      return [...ours];
    },

    handOff(sessionId) {
      handedOff.add(sessionId);
      ours.delete(sessionId);
    },

    release() {
      const closing = [...ours];
      ours.clear();
      return closing;
    },
  };
}
