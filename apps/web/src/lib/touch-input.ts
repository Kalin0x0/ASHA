/**
 * Touch input for the remote-desktop canvas.
 *
 * guacamole-common-js only ships bindings for a real mouse and a real keyboard,
 * so on a phone the viewer received no input at all: taps went nowhere, there was
 * no way to right-click, and a 1080p desktop rendered at ~0.2 scale with no way
 * to magnify it. This translates raw touches into the same mouse states the
 * desktop already understands, and keeps zoom/pan purely local so magnifying
 * costs nothing on the wire.
 *
 * Gestures
 *   one finger, tap             left click
 *   one finger, hold 500 ms     right click
 *   one finger, drag            press / move / release (drag, select, resize)
 *   two fingers, pinch          zoom the local view
 *   two fingers, drag (zoomed)  pan the view
 *   two fingers, drag (fitted)  scroll wheel on the remote
 *
 * The mouse button is committed lazily: nothing is sent until the touch either
 * moves past the slop, is released quickly, or the long-press timer fires. A
 * second finger landing shortly after the first therefore starts a clean
 * two-finger gesture instead of leaving a button pressed on the desktop.
 */

export interface TouchMouseState {
  x: number;
  y: number;
  left: boolean;
  middle: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
}

export interface TouchInputOptions {
  /** Element that receives the touches and clips/scrolls the display. */
  viewport: HTMLElement;
  /** The guacamole display element; its box is the scaled remote surface. */
  display: HTMLElement;
  /** Send a mouse state in REMOTE pixel coordinates. */
  send: (state: TouchMouseState) => void;
  /** Current remote-to-CSS scale (guacamole's display scale). */
  getScale: () => number;
  /** Apply a new display scale. */
  setScale: (scale: number) => void;
  /** Scale at which the whole desktop fits the viewport = the zoom floor. */
  getFitScale: () => number;
  /** Fired when a long press turns into a right click, for feedback. */
  onLongPress?: () => void;
  /** Fired whenever the zoom changes, so the toolbar can show the level. */
  onScaleChange?: (scale: number) => void;
}

const TAP_MS = 260;
const TAP_SLOP = 12;
const LONG_PRESS_MS = 500;
const WHEEL_NOTCH_PX = 44;
const MAX_SCALE = 3;
/** Relative pinch change that separates zooming from dragging two fingers. */
const PINCH_THRESHOLD = 0.12;

const NO_BUTTONS = { left: false, middle: false, right: false, up: false, down: false };

type Committed = null | 'drag' | 'longpress';
type GestureKind = null | 'zoom' | 'pan' | 'wheel';

const dist = (a: Touch, b: Touch) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
const midX = (a: Touch, b: Touch) => (a.clientX + b.clientX) / 2;
const midY = (a: Touch, b: Touch) => (a.clientY + b.clientY) / 2;

export function attachTouchInput(opts: TouchInputOptions): () => void {
  const { viewport, display, send, getScale, setScale, getFitScale } = opts;

  // One-finger pointer state.
  let startX = 0;
  let startY = 0;
  let startAt = 0;
  let lastX = 0;
  let lastY = 0;
  let pointerActive = false;
  let committed: Committed = null;
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;

  // Two-finger gesture state.
  let gesture: GestureKind = null;
  let gestureStarted = false;
  let startDist = 0;
  let startScale = 1;
  let lastCenterX = 0;
  let lastCenterY = 0;
  let wheelAccum = 0;

  /** Map a viewport-space point to remote pixels, clamped to the desktop. */
  const toRemote = (clientX: number, clientY: number) => {
    const rect = display.getBoundingClientRect();
    const sc = getScale() || 1;
    return {
      x: Math.max(0, Math.min(rect.width / sc, (clientX - rect.left) / sc)),
      y: Math.max(0, Math.min(rect.height / sc, (clientY - rect.top) / sc)),
    };
  };

  const at = (clientX: number, clientY: number, buttons: Partial<TouchMouseState> = {}) => {
    send({ ...NO_BUTTONS, ...toRemote(clientX, clientY), ...buttons });
  };

  /** Move, press, release: a click the desktop cannot miss. Moving first matters
   *  because menus and tooltips act on the pointer position, not the press. */
  const click = (clientX: number, clientY: number, button: 'left' | 'right') => {
    at(clientX, clientY);
    at(clientX, clientY, button === 'left' ? { left: true } : { right: true });
    at(clientX, clientY);
  };

  const cancelLongPress = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  };

  /** Release anything still held before a two-finger gesture takes over. */
  const releasePointer = () => {
    cancelLongPress();
    if (committed === 'drag') at(lastX, lastY);
    pointerActive = false;
    committed = null;
  };

  const applyScale = (next: number, centerX: number, centerY: number) => {
    const clamped = Math.max(getFitScale(), Math.min(MAX_SCALE, next));
    if (Math.abs(clamped - getScale()) < 0.001) return;

    // Keep the pixel under the pinch centre put: remember which remote pixel it
    // is, rescale, then scroll so that pixel lands back under the fingers.
    const before = toRemote(centerX, centerY);
    setScale(clamped);
    const rect = display.getBoundingClientRect();
    viewport.scrollLeft -= centerX - before.x * clamped - rect.left;
    viewport.scrollTop -= centerY - before.y * clamped - rect.top;
    opts.onScaleChange?.(clamped);
  };

  const canPan = () =>
    viewport.scrollWidth - viewport.clientWidth > 1 || viewport.scrollHeight - viewport.clientHeight > 1;

  const onTouchStart = (e: TouchEvent) => {
    e.preventDefault();
    if (e.touches.length === 1) {
      const t = e.touches[0];
      if (!t) return;
      pointerActive = true;
      committed = null;
      startX = lastX = t.clientX;
      startY = lastY = t.clientY;
      startAt = Date.now();
      cancelLongPress();
      longPressTimer = setTimeout(() => {
        longPressTimer = null;
        if (!pointerActive || committed) return;
        committed = 'longpress';
        click(lastX, lastY, 'right');
        opts.onLongPress?.();
      }, LONG_PRESS_MS);
      return;
    }
    if (e.touches.length >= 2) {
      // Any additional finger ends the one-finger interaction. Matching only
      // `=== 2` let a touch that jumped straight from one finger to three keep
      // the long-press armed, and it fired a right click into the desktop.
      releasePointer();
      const a = e.touches[0];
      const b = e.touches[1];
      if (!a || !b) return;
      gesture = null;
      gestureStarted = true;
      startDist = dist(a, b) || 1;
      startScale = getScale() || 1;
      lastCenterX = midX(a, b);
      lastCenterY = midY(a, b);
      wheelAccum = 0;
    }
  };

  const onTouchMove = (e: TouchEvent) => {
    e.preventDefault();

    if (gestureStarted && e.touches.length >= 2) {
      const a = e.touches[0];
      const b = e.touches[1];
      if (!a || !b) return;
      const d = dist(a, b) || 1;
      const cx = midX(a, b);
      const cy = midY(a, b);
      const ratio = d / startDist;

      // Pick the sub-gesture once, on the first meaningful movement, and keep it
      // until the fingers lift: switching mid-gesture reads as a glitch.
      if (!gesture) {
        const moved = Math.hypot(cx - lastCenterX, cy - lastCenterY);
        if (Math.abs(ratio - 1) > PINCH_THRESHOLD) gesture = 'zoom';
        else if (moved > TAP_SLOP) gesture = canPan() ? 'pan' : 'wheel';
        else return;
      }

      if (gesture === 'zoom') {
        applyScale(startScale * ratio, cx, cy);
        viewport.scrollLeft -= cx - lastCenterX;
        viewport.scrollTop -= cy - lastCenterY;
      } else if (gesture === 'pan') {
        viewport.scrollLeft -= cx - lastCenterX;
        viewport.scrollTop -= cy - lastCenterY;
      } else {
        // Fitted view: nothing to pan, so two fingers drive the remote wheel.
        // Dragging the content upwards scrolls down, as everywhere else.
        wheelAccum += cy - lastCenterY;
        while (Math.abs(wheelAccum) >= WHEEL_NOTCH_PX) {
          const down = wheelAccum < 0;
          wheelAccum += down ? WHEEL_NOTCH_PX : -WHEEL_NOTCH_PX;
          at(cx, cy, down ? { down: true } : { up: true });
          at(cx, cy);
        }
      }
      lastCenterX = cx;
      lastCenterY = cy;
      return;
    }

    if (!pointerActive || e.touches.length !== 1) return;
    const t = e.touches[0];
    if (!t) return;
    lastX = t.clientX;
    lastY = t.clientY;

    if (committed === 'longpress') return;
    if (!committed) {
      if (Math.hypot(lastX - startX, lastY - startY) < TAP_SLOP) return;
      // Past the slop, so this is a drag. Press at the ORIGINAL point so the
      // desktop sees the grab where the finger actually landed.
      cancelLongPress();
      committed = 'drag';
      at(startX, startY);
      at(startX, startY, { left: true });
    }
    at(lastX, lastY, { left: true });
  };

  const onTouchEnd = (e: TouchEvent) => {
    if (e.touches.length === 0) {
      gestureStarted = false;
      gesture = null;
      if (pointerActive) {
        cancelLongPress();
        if (committed === 'drag') at(lastX, lastY);
        // Anything released without committing is a click, however long it was
        // held: a press that outlasts the long-press timer has already committed
        // as 'longpress', so there is no window left in which a tap does nothing.
        else if (!committed) click(startX, startY, 'left');
        pointerActive = false;
        committed = null;
      }
      return;
    }
    // Fingers still down (one of two lifted): drop the gesture rather than
    // reinterpreting the remaining finger as a fresh drag mid-pinch.
    if (e.touches.length === 1 && gestureStarted) {
      gestureStarted = false;
      gesture = null;
      pointerActive = false;
      committed = null;
    }
  };

  const opt = { passive: false } as const;
  viewport.addEventListener('touchstart', onTouchStart, opt);
  viewport.addEventListener('touchmove', onTouchMove, opt);
  viewport.addEventListener('touchend', onTouchEnd, opt);
  viewport.addEventListener('touchcancel', onTouchEnd, opt);

  return () => {
    cancelLongPress();
    viewport.removeEventListener('touchstart', onTouchStart);
    viewport.removeEventListener('touchmove', onTouchMove);
    viewport.removeEventListener('touchend', onTouchEnd);
    viewport.removeEventListener('touchcancel', onTouchEnd);
  };
}

/** True when the browser is driven by touch rather than a mouse. */
export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
}
