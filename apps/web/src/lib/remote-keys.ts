/**
 * Which keysyms may be forwarded to a remote desktop.
 *
 * Guacamole's browser keyboard reports what the user's LOCAL layout produced,
 * as an X11 keysym. guacd then works out which scancodes and modifiers reach
 * that character in the REMOTE layout. Local modifiers that only exist to
 * produce the character in the first place must therefore stay on this side —
 * forwarding them makes guacd apply the modifier twice.
 */

/** ISO_Level3_Shift, which guacamole-common-js emits for the AltGr key. */
export const KEYSYM_ALTGR = 0xfe03;

/**
 * True when a keysym belongs on the wire.
 *
 * AltGr is the one exception. guacamole-common-js already treats it as local:
 * Windows reports the key as Ctrl+Alt, and the library's `release_simulated_altgr`
 * lifts that pair again before the character goes out. What it does not lift is
 * the ISO_Level3_Shift it synthesised itself, so the character reaches guacd with
 * AltGr held — while guacd is about to press AltGr on its own, because that is
 * how the character is typed in the server's layout. The two cancel out and
 * nothing arrives.
 *
 * Measured against a German keyboard on a German Windows desktop: "@" typed
 * plainly arrives, "@" typed as AltGr+Q arrives as nothing, and the same holds
 * for the rest of the row — \ | { } [ ] ~ € — which is most of what anyone
 * writing code or an e-mail address needs.
 */
export function forwardsToRemote(keysym: number): boolean {
  return keysym !== KEYSYM_ALTGR;
}
