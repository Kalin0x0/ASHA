/**
 * Text entry from a soft keyboard.
 *
 * Guacamole.Keyboard is built around physical key events. Phone keyboards are
 * not: Android's GBoard routes most characters through the composition path and
 * reports keyCode 229 ("Unidentified"), which produces no keysym at all, so
 * typing silently did nothing. iOS does emit real key events, so the two paths
 * have to coexist without doubling every character.
 *
 * The bridge therefore watches the same hidden textarea the browser types into:
 *   - our sink listener clears the flag at the start of every key,
 *   - Guacamole.Keyboard sets it when IT managed to map that key (call
 *     `noteKeysymSent` from its onkeydown),
 *   - the `input` event then only re-sends what Guacamole could not map.
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

export interface TextEntryOptions {
  /** The focusable element the soft keyboard types into. */
  sink: HTMLTextAreaElement;
  /** Press and release one keysym on the remote desktop. */
  tap: (keysym: number) => void;
}

export interface TextEntry {
  /** Tell the bridge Guacamole.Keyboard already handled the current key. */
  noteKeysymSent: () => void;
  detach: () => void;
}

export function attachTextEntry({ sink, tap }: TextEntryOptions): TextEntry {
  let handledByKeydown = false;

  // Runs before Guacamole's document-level handler (the sink is the target, so
  // its own listeners fire first), giving every key a clean slate.
  const onKeyDown = () => {
    handledByKeydown = false;
  };

  const onBeforeInput = (e: Event) => {
    const ie = e as InputEvent;
    if (handledByKeydown) return;
    if (ie.inputType === 'deleteContentBackward') tap(KEYSYMS.BACKSPACE);
    else if (ie.inputType === 'insertLineBreak' || ie.inputType === 'insertParagraph') tap(KEYSYMS.RETURN);
  };

  const onInput = (e: Event) => {
    const ie = e as InputEvent;
    const text = ie.data ?? sink.value;
    // Always drain the sink: it exists only to make the soft keyboard appear,
    // never to hold text.
    sink.value = '';
    if (handledByKeydown) {
      handledByKeydown = false;
      return;
    }
    // beforeinput already turned these into Return/BackSpace; the line feed they
    // also deliver would otherwise arrive a second time as a bare U+000A keysym,
    // so every newline typed on a soft keyboard was doubled.
    if (!text) return;
    if (ie.inputType?.startsWith('delete')) return;
    if (ie.inputType === 'insertLineBreak' || ie.inputType === 'insertParagraph') return;
    for (const ch of text) {
      const cp = ch.codePointAt(0);
      if (cp !== undefined) tap(keysymFromCodePoint(cp));
    }
  };

  sink.addEventListener('keydown', onKeyDown);
  sink.addEventListener('beforeinput', onBeforeInput);
  sink.addEventListener('input', onInput);

  return {
    noteKeysymSent: () => {
      handledByKeydown = true;
    },
    detach: () => {
      sink.removeEventListener('keydown', onKeyDown);
      sink.removeEventListener('beforeinput', onBeforeInput);
      sink.removeEventListener('input', onInput);
    },
  };
}
