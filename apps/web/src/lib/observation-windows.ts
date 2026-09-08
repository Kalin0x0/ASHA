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

/**
 * A hold id for one mounted surface, in the shape the API accepts
 * (`[A-Za-z0-9_-]{1,64}` — it refuses anything else rather than folding it into
 * the default hold).
 *
 * Per surface, not per session: holds are already kept per session on the API
 * side, so what has to be distinguished here is who is asking. Without it every
 * hold of one observer collapses onto a single id, and then a second wall tab —
 * or the wall unmounting behind a viewer — releases the window another surface
 * is still watching through, which takes the banner off the watched person's
 * screen and writes an `observation.stop` that did not happen.
 */
export function createWindowId(surface: string): string {
  const random =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '')
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `${surface}-${random}`.slice(0, 64);
}

/** The wall's own bookkeeping over the windows it opened. */
export interface ObservationWindows {
  /** The hold every window this surface opens is taken under. */
  readonly id: string;
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
  // Never reopened and never closed here. The viewer holds its own window and
  // renews it for as long as it is watching, and the wall's own hold on that
  // session lapses on its own — but a stop racing the viewer's first renewal
  // would still delete a record the viewer is about to re-create, blinking the
  // banner at the moment full-screen watching begins.
  const handedOff = new Set<string>();

  return {
    id: createWindowId('wall'),

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
