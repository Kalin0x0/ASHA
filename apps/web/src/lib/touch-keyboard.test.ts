import { describe, expect, it } from 'vitest';
import { attachTextEntry, isUnnamedKey, keysymFromCodePoint, KEYSYMS } from './touch-keyboard';

/**
 * The bridge exists for keys the browser cannot name. Everything else has
 * already been sent by Guacamole.Keyboard, which listens on `document` in the
 * CAPTURE phase — before anything registered on the sink. An earlier version
 * asked Guacamole what it had managed to map and was defeated by exactly that
 * ordering, sending Enter twice on every hardware keyboard; these tests drive
 * the DOM events themselves so the rule cannot silently invert again.
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
  return { entry, sink, sent, fire };
}

/** What a phone keyboard emits: a keydown nobody can name, then the text. */
const softKey = (h: ReturnType<typeof harness>, text: string) => {
  h.fire('keydown', { key: 'Unidentified', keyCode: 229, isComposing: false });
  h.fire('input', { data: text, inputType: 'insertText', isComposing: false });
  h.fire('keyup', {});
};

/** What a hardware keyboard emits: a named key. */
const hardKey = (h: ReturnType<typeof harness>, key: string, inputType = 'insertText', data: string | null = key) => {
  h.fire('keydown', { key, keyCode: key.charCodeAt(0), isComposing: false });
  h.fire('beforeinput', { inputType, data, isComposing: false });
  h.fire('input', { inputType, data, isComposing: false });
  h.fire('keyup', {});
};

describe('attachTextEntry', () => {
  it('sends what a composing soft keyboard types', () => {
    const h = harness();
    softKey(h, 'hi');
    expect(h.sent).toEqual([0x68, 0x69]);
  });

  it('stays out of the way of a hardware keyboard', () => {
    // Guacamole.Keyboard already sent this one; a second copy would double it.
    const h = harness();
    hardKey(h, 'a');
    expect(h.sent).toEqual([]);
  });

  it('does not send Enter a second time on a hardware keyboard', () => {
    // The regression this file was rewritten for: Enter is resolved by Guacamole
    // at keydown, and the bridge used to add its own RETURN on top.
    const h = harness();
    hardKey(h, 'Enter', 'insertLineBreak', null);
    expect(h.sent).toEqual([]);
  });

  it('does not send Backspace a second time on a hardware keyboard', () => {
    const h = harness();
    hardKey(h, 'Backspace', 'deleteContentBackward', null);
    expect(h.sent).toEqual([]);
  });

  it('sends Return once for a soft-keyboard newline', () => {
    const h = harness();
    h.fire('keydown', { key: 'Unidentified', keyCode: 229, isComposing: false });
    h.fire('beforeinput', { inputType: 'insertLineBreak', isComposing: false });
    h.fire('input', { data: '\n', inputType: 'insertLineBreak', isComposing: false });
    expect(h.sent).toEqual([KEYSYMS.RETURN]);
  });

  it('sends BackSpace once for a soft-keyboard deletion', () => {
    const h = harness();
    h.fire('keydown', { key: 'Unidentified', keyCode: 229, isComposing: false });
    h.fire('beforeinput', { inputType: 'deleteContentBackward', isComposing: false });
    h.fire('input', { data: null, inputType: 'deleteContentBackward', isComposing: false });
    expect(h.sent).toEqual([KEYSYMS.BACKSPACE]);
  });

  it('waits for a dead key to compose instead of sending the bare accent', () => {
    // German hardware layout: pressing the accent key then "e" gives "é". The
    // intermediate composition events must not put a lone accent on the wire.
    const h = harness();
    h.fire('keydown', { key: 'Dead', keyCode: 229, isComposing: false });
    h.fire('input', { data: '´', inputType: 'insertCompositionText', isComposing: true });
    expect(h.sent).toEqual([]);
    h.fire('keydown', { key: 'e', keyCode: 69, isComposing: true });
    h.fire('input', { data: 'é', inputType: 'insertText', isComposing: false });
    expect(h.sent).toEqual([0xe9]);
  });

  it('sends text that arrives with no key event at all', () => {
    // Some IMEs and autocorrect paths emit only an input event.
    const h = harness();
    h.fire('input', { data: 'ok', inputType: 'insertText', isComposing: false });
    expect(h.sent).toEqual([0x6f, 0x6b]);
  });

  it('does not let a text-less key block the next soft-keyboard character', () => {
    const h = harness();
    hardKey(h, 'ArrowLeft', 'insertText', null); // named key, no text
    softKey(h, 'x');
    expect(h.sent).toEqual([0x78]);
  });

  it('drains the sink so absorbed text never accumulates', () => {
    const h = harness();
    h.sink.value = 'leftover';
    softKey(h, 'x');
    expect(h.sink.value).toBe('');
  });

  it('detaches every listener', () => {
    const h = harness();
    h.entry.detach();
    softKey(h, 'x');
    expect(h.sent).toEqual([]);
  });
});

describe('isUnnamedKey', () => {
  it('recognises the shapes a soft keyboard produces', () => {
    expect(isUnnamedKey({ key: 'Unidentified', keyCode: 229, isComposing: false })).toBe(true);
    expect(isUnnamedKey({ key: 'a', keyCode: 229, isComposing: false })).toBe(true);
    expect(isUnnamedKey({ key: 'a', keyCode: 65, isComposing: true })).toBe(true);
  });

  it('leaves an ordinary hardware key alone', () => {
    expect(isUnnamedKey({ key: 'a', keyCode: 65, isComposing: false })).toBe(false);
    expect(isUnnamedKey({ key: 'Enter', keyCode: 13, isComposing: false })).toBe(false);
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
