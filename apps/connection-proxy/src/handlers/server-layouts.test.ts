import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isRdpServerLayout, RDP_SERVER_LAYOUTS } from './server-layouts.js';

describe('isRdpServerLayout — what may reach a guacd connect instruction', () => {
  it('accepts every layout the guacd image carries', () => {
    for (const layout of RDP_SERVER_LAYOUTS) expect(isRdpServerLayout(layout)).toBe(true);
    // The list is what `strings` found in libguac-client-rdp.a. A shorter one
    // here silently takes layouts away from the people who need them.
    expect(RDP_SERVER_LAYOUTS).toHaveLength(18);
  });

  it('rejects a name guacd does not know, however plausible it reads', () => {
    // Austria types on a German keyboard, and guacd still ships no
    // `de-at-qwertz` — forwarded, it costs the connection, not the keyboard.
    expect(isRdpServerLayout('de-at-qwertz')).toBe(false);
    expect(isRdpServerLayout('en-us')).toBe(false);
    // guacd matches the name exactly.
    expect(isRdpServerLayout('DE-DE-QWERTZ')).toBe(false);
  });

  it('rejects what else a query parameter can carry', () => {
    expect(isRdpServerLayout('')).toBe(false);
    expect(isRdpServerLayout('de-de-qwertz;$(id)')).toBe(false);
    expect(isRdpServerLayout('a'.repeat(4096))).toBe(false);
  });
});

/**
 * The same 18 names are written out three times: here (the proxy validates what
 * goes on the wire), in @asha/contracts (the API validates what an admin sets on
 * a Server) and in the viewer (it offers them by name). Nothing links the three
 * — the proxy and the web app each share no package with the API — so the copies
 * are compared as text. A layout missing from one of them is a layout an admin
 * can set and the connection then refuses, or one nobody can pick at all.
 */
function listedIn(relativePath: string, constant: string): string[] {
  const source = readFileSync(fileURLToPath(new URL(`../../../../${relativePath}`, import.meta.url)), 'utf8');
  const body = new RegExp(`export const ${constant} = \\[([^\\]]*)\\] as const;`).exec(source);
  if (!body) throw new Error(`no ${constant} array in ${relativePath}`);
  return [...body[1]!.matchAll(/'([^']+)'/g)].map((m) => m[1]!);
}

describe('the three copies of the layout list', () => {
  it('matches the API contract the admin surface validates against', () => {
    expect(listedIn('packages/contracts/src/index.ts', 'RDP_SERVER_LAYOUTS')).toEqual([...RDP_SERVER_LAYOUTS]);
  });

  it('matches the list the viewer offers', () => {
    expect(listedIn('apps/web/src/lib/keyboard-layout.ts', 'REMOTE_LAYOUTS')).toEqual([...RDP_SERVER_LAYOUTS]);
  });
});
