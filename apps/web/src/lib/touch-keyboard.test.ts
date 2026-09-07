import { describe, expect, it, vi } from 'vitest';
import { attachTextEntry, keysymFromCodePoint, KEYSYMS } from './touch-keyboard';

/**
 * The bridge sits on a hidden textarea and has to cope with two very different
 * browsers: iOS emits real key events (so Guacamole.Keyboard already handled the
 * key), while Android routes most characters through composition and emits none.
 * These tests drive the DOM events directly against a stand-in element.
 */
function harness() {
  const listeners: Record<string, ((e: Event) => void)[]> = {};
  const sent: number[] = [];
  const sink = {
    value: '',
    addEventListener: (t: string, fn: (e: Event) => void) => {
      (listeners[t] ??= []).push(fn);
    },
    removeEventListener: (t: string, fn: (e: Event) => void) => {
      listeners[t] = (listeners[t] ?? []).filter((f) => f !== fn);
    },
  } as unknown as HTMLTextAreaElement;

  const entry = attachTextEntry({ sink, tap: (k) => sent.push(k) });
  const fire = (type: string, props: Record<string, unknown> = {}) => {
    for (const fn of listeners[type] ?? []) fn(props as unknown as Event);
  };
  return { entry, sink, sent, fire, listeners };
}

describe('attachTextEntry', () => {
  it('sends what a composing soft keyboard types', () => {
    const h = harness();
    h.fire('keydown');
    h.fire('input', { data: 'hi', inputType: 'insertText' });
    expect(h.sent).toEqual([0x68, 0x69]);
  });

  it('does not repeat a key Guacamole.Keyboard already handled', () => {
    const h = harness();
    h.fire('keydown');
    h.entry.noteKeysymSent(); // iOS: a real keydown produced a keysym
    h.fire('input', { data: 'a', inputType: 'insertText' });
    expect(h.sent).toEqual([]);
  });

  it('sends Return exactly once for a newline', () => {
    // beforeinput turns it into Return; the input event that follows carries the
    // line feed as data and used to send a second, bare U+000A keysym.
    const h = harness();
    h.fire('keydown');
    h.fire('beforeinput', { inputType: 'insertLineBreak' });
    h.fire('input', { data: '\n', inputType: 'insertLineBreak' });
    expect(h.sent).toEqual([KEYSYMS.RETURN]);
  });

  it('sends BackSpace exactly once for a deletion', () => {
    const h = harness();
    h.fire('keydown');
    h.fire('beforeinput', { inputType: 'deleteContentBackward' });
    h.fire('input', { data: null, inputType: 'deleteContentBackward' });
    expect(h.sent).toEqual([KEYSYMS.BACKSPACE]);
  });

  it('drains the sink so absorbed text never accumulates', () => {
    const h = harness();
    h.sink.value = 'leftover';
    h.fire('input', { data: 'x', inputType: 'insertText' });
    expect(h.sink.value).toBe('');
  });

  it('detaches every listener', () => {
    const h = harness();
    h.entry.detach();
    h.fire('input', { data: 'x', inputType: 'insertText' });
    expect(h.sent).toEqual([]);
  });
});

describe('keysymFromCodePoint', () => {
  it('maps Latin-1 to itself and everything else into the Unicode plane', () => {
    expect(keysymFromCodePoint(0x61)).toBe(0x61); // a
    expect(keysymFromCodePoint(0xe4)).toBe(0xe4); // ä
    expect(keysymFromCodePoint(0x20ac)).toBe(0x0100_20ac); // €
    expect(keysymFromCodePoint(0x1f600)).toBe(0x0101_f600); // emoji
  });
});
