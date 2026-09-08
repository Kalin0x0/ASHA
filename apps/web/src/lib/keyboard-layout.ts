/**
 * Which keyboard layout the REMOTE desktop is told it has.
 *
 * guacamole-common-js sends X11 keysyms — the CHARACTER the pressed key
 * produced, not the key's position. The user's own keyboard is therefore
 * already accounted for before anything leaves the browser. What is still open
 * is the far end: guacd's `server-layout` decides which scancodes reproduce
 * that character, and Windows turns those scancodes back into a character with
 * whatever layout IT is configured for. The round trip only comes out even when
 * `server-layout` matches the remote machine.
 *
 * So this value describes a machine, and it belongs on that machine's record —
 * `Server.keyboardLayout`, set by whoever knows what the host is. What the
 * viewer adds is the correction on top: someone whose desktop is typing rubbish
 * puts it right in one click instead of waiting for an admin, for the
 * connection in front of them and nothing else.
 *
 * Nothing here reads the local keyboard. `navigator.keyboard.getLayoutMap()`
 * reports the layout of the keyboard the user is typing on, which is the one
 * thing this parameter must not be derived from — an earlier attempt did
 * exactly that and put a German desktop in front of everyone.
 */

/**
 * The layouts guacd accepts, read out of the `libguac-client-rdp` binary in the
 * running image. It refuses the whole connection for anything else, so only a
 * name from this list is ever put on the wire. Mirrors `RDP_SERVER_LAYOUTS` in
 * @asha/contracts — the web app shares no package with the API, and
 * server-layouts.test.ts fails if the two drift apart.
 */
export const REMOTE_LAYOUTS = [
  'da-dk-qwerty',
  'de-ch-qwertz',
  'de-de-qwertz',
  'en-gb-qwerty',
  'en-us-qwerty',
  'es-es-qwerty',
  'failsafe',
  'fr-be-azerty',
  'fr-ch-qwertz',
  'fr-fr-azerty',
  'hu-hu-qwertz',
  'it-it-qwerty',
  'ja-jp-qwerty',
  'no-no-qwerty',
  'pl-pl-qwerty',
  'pt-br-qwerty',
  'sv-se-qwerty',
  'tr-tr-qwerty',
] as const;

export type RemoteLayout = (typeof REMOTE_LAYOUTS)[number];

/** The choice that sends nothing and leaves the server's own setting standing. */
export const LAYOUT_INHERIT = 'inherit';

/** What the viewer offers: keep the server's setting, or overrule it. */
export const LAYOUT_CHOICES = [LAYOUT_INHERIT, ...REMOTE_LAYOUTS] as const;

export function isRemoteLayout(value: string | null | undefined): value is RemoteLayout {
  return value !== null && value !== undefined && (REMOTE_LAYOUTS as readonly string[]).includes(value);
}

/**
 * The layout to put in the stream URL, or null to send none. Null is the normal
 * case: the proxy then answers with `Server.keyboardLayout` and, failing that,
 * the installation default — which is how every viewer behaved before this
 * control existed. Anything that is not a layout guacd knows reads as inherit
 * rather than travelling on to a connect parameter.
 */
export function layoutParam(choice: string | null | undefined): RemoteLayout | null {
  return isRemoteLayout(choice) ? choice : null;
}
