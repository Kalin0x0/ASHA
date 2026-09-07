/**
 * Text entry for keys the browser cannot name.
 *
 * Guacamole.Keyboard is built around physical key events. Phone keyboards are
 * not: Android's GBoard routes most characters through the composition path and
 * reports keyCode 229 ("Unidentified"), which produces no keysym at all, so
 * typing silently did nothing. The same is true of a dead key on a hardware
 * German keyboard — the accent that turns e into é is composed, not pressed.
 *
 * The bridge watches the hidden textarea the browser types into and re-sends
 * only what nobody else could have sent. It decides that from the DOM event
 * alone: a key the browser named is a key Guacamole.Keyboard has already
 * handled, and one it could not name is one only this path can deliver.
 *
 * It deliberately does NOT ask Guacamole what it managed to map. That handshake
 * existed here once and was inert: guacamole-common-js registers its listeners
 * on `document` in the CAPTURE phase, so it runs BEFORE a target-phase listener
 * on the sink — every flag this file set was overwritten a moment later, and
 * Enter went out twice on every hardware keyboard.
 */

/** X11 keysyms used by the on-screen key bar and this bridge. */
export const KEYSYMS = {
  BACKSPACE: 0xff08,
  TAB: 0xff09,
  RETURN: 0xff0d,
  ESCAPE: 0xff1b,
  DELETE: 0xffff,
  HOME: 0xff50,
  LEFT: 0xff51,
  UP: 0xff52,
  RIGHT: 0xff53,
  DOWN: 0xff54,
  PAGE_UP: 0xff55,
  PAGE_DOWN: 0xff56,
  END: 0xff57,
  SHIFT: 0xffe1,
  CTRL: 0xffe3,
  ALT: 0xffe9,
  SUPER: 0xffeb,
} as const;

/** Map a Unicode code point to an X11 keysym (Latin-1 is identity). */
export function keysymFromCodePoint(cp: number): number {
  if (cp >= 0x20 && cp <= 0xff) return cp;
  return 0x01000000 + cp;
}

/**
 * True when the browser could not say which key this was — the only case this
 * bridge is here for. Everything else has a name, and therefore a keysym that
 * Guacamole.Keyboard has already put on the wire.
 */
export function isUnnamedKey(e: Pick<KeyboardEvent, 'key' | 'keyCode' | 'isComposing'>): boolean {
  return e.keyCode === 229 || e.key === 'Unidentified' || e.isComposing === true;
}

export interface TextEntryOptions {
  /** The focusable element the soft keyboard types into. */
  sink: HTMLTextAreaElement;
  /** Press and release one keysym on the remote desktop. */
  tap: (keysym: number) => void;
}

export interface TextEntry {
  detach: () => void;
}

export function attachTextEntry({ sink, tap }: TextEntryOptions): TextEntry {
  // State of the key currently in flight, read by the input events that follow.
  let sawKeydown = false;
  let unnamed = false;

  const onKeyDown = (e: Event) => {
    sawKeydown = true;
    unnamed = isUnnamedKey(e as KeyboardEvent);
  };

  // A key that produced no text at all (arrows, F-keys) must not leave its state
  // behind for the next soft-keyboard character to trip over.
  const onKeyUp = () => {
    sawKeydown = false;
    unnamed = false;
  };

  /** Some soft keyboards emit no key event whatsoever — then nothing else sent it. */
  const mine = (e: InputEvent) => !e.isComposing && (unnamed || !sawKeydown);

  const onBeforeInput = (e: Event) => {
    const ie = e as InputEvent;
    if (!mine(ie)) return;
    if (ie.inputType === 'deleteContentBackward') tap(KEYSYMS.BACKSPACE);
    else if (ie.inputType === 'insertLineBreak' || ie.inputType === 'insertParagraph') tap(KEYSYMS.RETURN);
  };

  const onInput = (e: Event) => {
    const ie = e as InputEvent;
    const text = ie.data ?? sink.value;
    // Always drain the sink: it exists only to make the soft keyboard appear,
    // never to hold text.
    sink.value = '';
    if (!mine(ie)) return;
    // beforeinput already turned these into Return/BackSpace; the line feed they
    // also deliver would otherwise arrive a second time as a bare U+000A keysym.
    if (!text) return;
    if (ie.inputType?.startsWith('delete')) return;
    if (ie.inputType === 'insertLineBreak' || ie.inputType === 'insertParagraph') return;
    for (const ch of text) {
      const cp = ch.codePointAt(0);
      if (cp !== undefined) tap(keysymFromCodePoint(cp));
    }
  };

  sink.addEventListener('keydown', onKeyDown);
  sink.addEventListener('keyup', onKeyUp);
  sink.addEventListener('beforeinput', onBeforeInput);
  sink.addEventListener('input', onInput);

  return {
    detach: () => {
      sink.removeEventListener('keydown', onKeyDown);
      sink.removeEventListener('keyup', onKeyUp);
      sink.removeEventListener('beforeinput', onBeforeInput);
      sink.removeEventListener('input', onInput);
    },
  };
}
