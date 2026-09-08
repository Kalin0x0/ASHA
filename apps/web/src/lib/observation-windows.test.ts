import { describe, expect, it } from 'vitest';
import { createObservationWindows, createWindowId } from './observation-windows';

describe('createWindowId', () => {
  it('is unique per surface, so two of them are two holds', () => {
    // Every surface used to send no window id at all, which collapses them onto
    // the caller's one default hold: a second wall tab, or the wall unmounting
    // behind a viewer, then released the window the other was still watching
    // through — banner off, `observation.stop` written, capture stopped.
    const wall = createObservationWindows();
    const viewer = createWindowId('view');
    expect(wall.id).not.toBe(viewer);
    expect(createObservationWindows().id).not.toBe(wall.id);
  });

  it('is an id the API accepts rather than one it refuses', () => {
    // The API rejects a malformed window id outright instead of folding it into
    // the default hold, so a generated one that does not match costs the caller
    // every request it makes.
    for (const id of [createWindowId('wall'), createWindowId('view')]) {
      expect(id).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
    }
  });
});

describe('the wall’s observation windows', () => {
  it('opens one per tile and closes the ones that left the wall', () => {
    const windows = createObservationWindows();
    expect(windows.sync(['a', 'b'])).toEqual({ open: ['a', 'b'], close: [] });

    // A tile that scrolled out of the filter is no longer being looked at, so
    // its window — and the notice on that person's screen — has to go.
    expect(windows.sync(['b'])).toEqual({ open: ['b'], close: ['a'] });
  });

  it('keeps the window it handed to a viewer open when the wall is left', () => {
    // The click on "watch live" mints a window and navigates, which unmounts
    // the wall. Closing that window here would delete the watch record, take
    // the banner off the watched person's screen and write observation.stop —
    // all at the exact moment full-screen watching begins.
    const windows = createObservationWindows();
    windows.sync(['a', 'b']);
    windows.handOff('a');

    expect(windows.release()).toEqual(['b']);
  });

  it('leaves a handed-off window alone while the wall is still open', () => {
    const windows = createObservationWindows();
    windows.sync(['a', 'b']);
    windows.handOff('a');

    // Neither reopened by the next reconcile nor renewed by the timer: the
    // viewer owns it now and renews it for as long as it is watching.
    expect(windows.sync(['a', 'b'])).toEqual({ open: ['b'], close: [] });
    expect(windows.renew()).toEqual(['b']);
  });

  it('renews every window it still owns, so the agent never times out under it', () => {
    const windows = createObservationWindows();
    windows.sync(['a', 'b']);
    expect(windows.renew()).toEqual(['a', 'b']);

    windows.release();
    expect(windows.renew()).toEqual([]);
  });
});
