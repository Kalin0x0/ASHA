/**
 * The keyboard layouts guacd's RDP client accepts for `server-layout`.
 *
 * Read out of the running image (`strings /opt/guacamole/lib/libguac-client-rdp.a`
 * on asha-guacd-h264:1.5.5) rather than off a documentation page, because guacd
 * refuses the whole connection for a name it does not know — and the name comes
 * either from the browser's query string or from a Server row, i.e. straight
 * into a guacd connect instruction either way. Anything not on the list is
 * dropped instead of forwarded.
 *
 * Kept in step with `RDP_SERVER_LAYOUTS` in @asha/contracts by
 * server-layouts.test.ts; the proxy shares no package with the API.
 *
 * RDP only: guacd's VNC client advertises no such parameter at all.
 */
export const RDP_SERVER_LAYOUTS = [
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

export type RdpServerLayout = (typeof RDP_SERVER_LAYOUTS)[number];

const ACCEPTED = new Set<string>(RDP_SERVER_LAYOUTS);

/** True when guacd would accept `value` as a server layout, matched exactly. */
export function isRdpServerLayout(value: string): value is RdpServerLayout {
  return ACCEPTED.has(value);
}
