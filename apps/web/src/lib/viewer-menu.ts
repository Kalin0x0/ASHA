/**
 * The desktop viewers' menu bar: where it sits, whether it shows.
 *
 *   docked    open, pinned, not fullscreen   in the layout; the desktop is
 *                                            sized around it
 *   floating  open otherwise                 over the top of the desktop,
 *                                            taking no space from it
 *   hidden    !open                          folded away; a small pull-tab
 *                                            brings it back
 *
 * Only docked changes the desktop's box, and every change of that box resizes
 * the remote screen. So it changes only on a deliberate act — folding the bar
 * away, pinning it back, entering or leaving fullscreen — and never on a look:
 * the pull-tab floats the bar, and pinning is its own button.
 *
 * `fullscreen` comes ONLY from the browser's `fullscreenchange` event. Esc, the
 * browser's own controls, Android's back gesture and our button all land in the
 * same place, and a refused request hides nothing. Entering folds the bar away —
 * the whole screen becomes the desktop. Leaving always restores the docked bar,
 * whatever happened in between: a window with no menu in it must never pass for
 * a fullscreen the user cannot leave.
 *
 * Not persisted: a stored "hidden" would change the desktop's box during the
 * connection handshake, and the next person at a shared machine would find the
 * menu gone.
 */
export interface ViewerMenu {
  fullscreen: boolean;
  open: boolean;
  /** Docked, or folded away from docked. The pull-tab clears it — a look from
   *  there floats instead of resizing the desktop twice — and only the pin sets
   *  it again. */
  pinned: boolean;
}

export type ViewerMenuEvent =
  | { type: 'fullscreen'; on: boolean }
  | { type: 'show' }
  | { type: 'hide' }
  | { type: 'pin' };

export const INITIAL_VIEWER_MENU: ViewerMenu = { fullscreen: false, open: true, pinned: true };

export function viewerMenuReducer(state: ViewerMenu, event: ViewerMenuEvent): ViewerMenu {
  switch (event.type) {
    case 'fullscreen':
      if (event.on === state.fullscreen) return state;
      return event.on ? { ...state, fullscreen: true, open: false } : INITIAL_VIEWER_MENU;
    case 'show':
      return state.open ? state : { ...state, open: true, pinned: false };
    case 'hide':
      return state.open ? { ...state, open: false } : state;
    case 'pin':
      return state.open && state.pinned ? state : { ...state, open: true, pinned: true };
  }
}

/** The bar takes layout space — the only state in which the desktop is sized around it. */
export const menuDocked = (m: ViewerMenu): boolean => m.open && m.pinned && !m.fullscreen;

/** The bar lies over the desktop: shown from the pull-tab, or in fullscreen. */
export const menuFloating = (m: ViewerMenu): boolean => m.open && !menuDocked(m);

/** The bar hangs from the top edge as a floating panel instead of spanning it.
 *  Folding away keeps the shape it had, so it never changes form mid-slide. */
export const menuHanging = (m: ViewerMenu): boolean => (m.open ? menuFloating(m) : !m.pinned);
