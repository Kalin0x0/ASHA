import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attachTouchInput, type TouchMouseState } from './touch-input';

/**
 * The gesture layer is pure event arithmetic, so it is tested against minimal
 * stand-ins rather than a browser: a viewport that records listeners and scroll
 * offsets, and a display whose box is the remote size times the scale.
 */
type Handlers = Record<string, (e: TouchEvent) => void>;

function harness({ remote = { w: 1000, h: 800 }, scale = 0.5, viewportSize = { w: 500, h: 400 } } = {}) {
  const handlers: Handlers = {};
  const sent: TouchMouseState[] = [];
  let current = scale;

  const viewport = {
    scrollLeft: 0,
    scrollTop: 0,
    clientWidth: viewportSize.w,
    clientHeight: viewportSize.h,
    get scrollWidth() {
      return Math.max(viewportSize.w, remote.w * current);
    },
    get scrollHeight() {
      return Math.max(viewportSize.h, remote.h * current);
    },
    addEventListener: (type: string, fn: (e: TouchEvent) => void) => {
      handlers[type] = fn;
    },
    removeEventListener: (type: string) => {
      delete handlers[type];
    },
  } as unknown as HTMLElement;

  const display = {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: remote.w * current, height: remote.h * current }),
  } as unknown as HTMLElement;

  const detach = attachTouchInput({
    viewport,
    display,
    send: (s) => sent.push(s),
    getScale: () => current,
    setScale: (s) => {
      current = s;
    },
    getFitScale: () => Math.min(viewportSize.w / remote.w, viewportSize.h / remote.h),
  });

  const fire = (type: string, points: Array<{ x: number; y: number }>) => {
    handlers[type]?.({
      touches: points.map((p) => ({ clientX: p.x, clientY: p.y })),
      preventDefault: () => {},
    } as unknown as TouchEvent);
  };

  return { fire, sent, detach, scale: () => current, viewport };
}

describe('attachTouchInput', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('turns a tap into a left click at the remote coordinate', () => {
    const h = harness();
    h.fire('touchstart', [{ x: 100, y: 50 }]);
    h.fire('touchend', []);

    // Scale 0.5, so viewport (100,50) is remote (200,100): move, press, release.
    expect(h.sent).toEqual([
      { x: 200, y: 100, left: false, middle: false, right: false, up: false, down: false },
      { x: 200, y: 100, left: true, middle: false, right: false, up: false, down: false },
      { x: 200, y: 100, left: false, middle: false, right: false, up: false, down: false },
    ]);
  });

  it('sends nothing until the touch is released, so a second finger can take over', () => {
    const h = harness();
    h.fire('touchstart', [{ x: 100, y: 50 }]);
    expect(h.sent).toHaveLength(0);

    // The second finger arrives before any commit: a pinch, not a click.
    h.fire('touchstart', [
      { x: 100, y: 50 },
      { x: 200, y: 50 },
    ]);
    h.fire('touchend', []);
    expect(h.sent).toHaveLength(0);
  });

  it('turns a long press into a right click', () => {
    const h = harness();
    h.fire('touchstart', [{ x: 40, y: 40 }]);
    vi.advanceTimersByTime(600);

    expect(h.sent.map((s) => s.right)).toEqual([false, true, false]);
    // Releasing afterwards must not add a left click on top of it.
    h.fire('touchend', []);
    expect(h.sent).toHaveLength(3);
  });

  it('drags with the button held from the point the finger landed', () => {
    const h = harness();
    h.fire('touchstart', [{ x: 100, y: 100 }]);
    h.fire('touchmove', [{ x: 160, y: 100 }]);
    h.fire('touchend', []);

    // Press at the ORIGINAL point (200,200), move held, release at the end point.
    expect(h.sent.map((s) => [s.x, s.left])).toEqual([
      [200, false],
      [200, true],
      [320, true],
      [320, false],
    ]);
  });

  it('ignores movement inside the tap slop', () => {
    const h = harness();
    h.fire('touchstart', [{ x: 100, y: 100 }]);
    h.fire('touchmove', [{ x: 104, y: 103 }]);
    expect(h.sent).toHaveLength(0);
    h.fire('touchend', []);
    expect(h.sent.map((s) => s.left)).toEqual([false, true, false]);
  });

  it('scrolls the remote when two fingers drag a view that has nothing to pan', () => {
    // Fit scale for 1000x800 in 500x400 is 0.5, so the desktop exactly fills the
    // viewport: panning is meaningless and the gesture becomes a wheel.
    const h = harness();
    h.fire('touchstart', [
      { x: 200, y: 300 },
      { x: 260, y: 300 },
    ]);
    h.fire('touchmove', [
      { x: 200, y: 200 },
      { x: 260, y: 200 },
    ]);

    // Dragging the content upwards scrolls down, and no panning took place.
    expect(h.sent.filter((s) => s.down)).toHaveLength(2);
    expect(h.sent.filter((s) => s.up)).toHaveLength(0);
    expect(h.viewport.scrollTop).toBe(0);
  });

  it('pinches to zoom and never below the fit scale', () => {
    const h = harness();
    h.fire('touchstart', [
      { x: 200, y: 200 },
      { x: 300, y: 200 },
    ]);
    h.fire('touchmove', [
      { x: 150, y: 200 },
      { x: 350, y: 200 },
    ]);
    expect(h.scale()).toBeCloseTo(1, 5); // fingers twice as far apart

    // Pinching back in stops at "whole desktop visible" rather than shrinking it.
    h.fire('touchmove', [
      { x: 240, y: 200 },
      { x: 260, y: 200 },
    ]);
    expect(h.scale()).toBeCloseTo(0.5, 5);
  });

  it('releases a held button when a second finger interrupts a drag', () => {
    const h = harness();
    h.fire('touchstart', [{ x: 100, y: 100 }]);
    h.fire('touchmove', [{ x: 200, y: 100 }]);
    expect(h.sent.at(-1)?.left).toBe(true);

    h.fire('touchstart', [
      { x: 200, y: 100 },
      { x: 300, y: 100 },
    ]);
    // The button must not stay down on the desktop for the rest of the session.
    expect(h.sent.at(-1)?.left).toBe(false);
  });

  it('clicks a tap held longer than the tap window but released before the long press', () => {
    // The gap between TAP_MS (260) and LONG_PRESS_MS (500): a motionless press
    // released in there committed to nothing and used to send absolutely nothing.
    const h = harness();
    h.fire('touchstart', [{ x: 100, y: 100 }]);
    vi.advanceTimersByTime(400);
    h.fire('touchend', []);
    expect(h.sent.map((s) => s.left)).toEqual([false, true, false]);
  });

  it('does not fire a right click when a touch jumps straight to three fingers', () => {
    const h = harness();
    h.fire('touchstart', [{ x: 100, y: 100 }]);
    h.fire('touchstart', [
      { x: 100, y: 100 },
      { x: 200, y: 100 },
      { x: 300, y: 100 },
    ]);
    vi.advanceTimersByTime(900);
    expect(h.sent.filter((s) => s.right)).toHaveLength(0);
  });

  it('detaches every listener', () => {
    const h = harness();
    h.detach();
    h.fire('touchstart', [{ x: 10, y: 10 }]);
    h.fire('touchend', []);
    expect(h.sent).toHaveLength(0);
  });
});
