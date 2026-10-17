import { describe, expect, it } from 'vitest';
import {
  INITIAL_VIEWER_MENU,
  menuDocked,
  menuFloating,
  menuHanging,
  viewerMenuReducer,
  type ViewerMenuEvent,
} from './viewer-menu';

const run = (...events: ViewerMenuEvent[]) => events.reduce(viewerMenuReducer, INITIAL_VIEWER_MENU);
const FS_ON: ViewerMenuEvent = { type: 'fullscreen', on: true };
const FS_OFF: ViewerMenuEvent = { type: 'fullscreen', on: false };

describe('viewer menu', () => {
  it('starts docked, as the viewer always looked', () => {
    expect(menuDocked(INITIAL_VIEWER_MENU)).toBe(true);
    expect(menuFloating(INITIAL_VIEWER_MENU)).toBe(false);
  });

  it('folds the menu away on entering fullscreen, so the whole screen is the desktop', () => {
    const s = run(FS_ON);
    expect(s.open).toBe(false);
    expect(menuDocked(s)).toBe(false);
  });

  it('brings the docked menu back however fullscreen was left — Esc included', () => {
    expect(run(FS_ON, FS_OFF)).toEqual(INITIAL_VIEWER_MENU);
    // Even when the user had folded it away before going fullscreen, or looked
    // at it and folded it again inside: a window with no menu in it would pass
    // for a fullscreen they cannot leave.
    expect(run({ type: 'hide' }, FS_ON, FS_OFF)).toEqual(INITIAL_VIEWER_MENU);
    expect(run(FS_ON, { type: 'show' }, { type: 'hide' }, FS_OFF)).toEqual(INITIAL_VIEWER_MENU);
  });

  it('floats a menu brought back from the pull-tab instead of docking it', () => {
    // Docking would shrink the desktop's box and resize the remote screen on
    // every look at the menu — twice, counting the way back.
    for (const s of [run(FS_ON, { type: 'show' }), run({ type: 'hide' }, { type: 'show' })]) {
      expect(s.open).toBe(true);
      expect(menuDocked(s)).toBe(false);
      expect(menuFloating(s)).toBe(true);
    }
  });

  it('docks again only when pinned', () => {
    const s = run({ type: 'hide' }, { type: 'show' }, { type: 'pin' });
    expect(menuDocked(s)).toBe(true);
    // Straight from the pull-tab, too.
    expect(menuDocked(run({ type: 'hide' }, { type: 'pin' }))).toBe(true);
  });

  it('takes space only while docked', () => {
    // The one fact the viewers size the desktop from — every other state must
    // leave the remote screen alone.
    const states = [
      INITIAL_VIEWER_MENU,
      run({ type: 'hide' }),
      run({ type: 'hide' }, { type: 'show' }),
      run(FS_ON),
      run(FS_ON, { type: 'show' }),
      run(FS_ON, { type: 'pin' }),
    ];
    expect(states.map(menuDocked)).toEqual([true, false, false, false, false, false]);
  });

  it('folds away in the shape it had, so it never changes form mid-slide', () => {
    // Docked spans the top edge; floating hangs from it as a panel.
    expect(menuHanging(INITIAL_VIEWER_MENU)).toBe(false);
    expect(menuHanging(run({ type: 'hide' }))).toBe(false);
    expect(menuHanging(run(FS_ON))).toBe(false);
    expect(menuHanging(run({ type: 'hide' }, { type: 'show' }))).toBe(true);
    expect(menuHanging(run({ type: 'hide' }, { type: 'show' }, { type: 'hide' }))).toBe(true);
    expect(menuHanging(run(FS_ON, { type: 'show' }, { type: 'hide' }))).toBe(true);
    expect(menuHanging(run({ type: 'hide' }, { type: 'show' }, { type: 'pin' }))).toBe(false);
  });

  it('ignores repeats, so a duplicate event does not re-render the viewer', () => {
    expect(viewerMenuReducer(INITIAL_VIEWER_MENU, { type: 'show' })).toBe(INITIAL_VIEWER_MENU);
    expect(viewerMenuReducer(INITIAL_VIEWER_MENU, { type: 'pin' })).toBe(INITIAL_VIEWER_MENU);
    expect(viewerMenuReducer(INITIAL_VIEWER_MENU, FS_OFF)).toBe(INITIAL_VIEWER_MENU);
    const hidden = run({ type: 'hide' });
    expect(viewerMenuReducer(hidden, { type: 'hide' })).toBe(hidden);
    const full = run(FS_ON);
    expect(viewerMenuReducer(full, FS_ON)).toBe(full);
  });
});
