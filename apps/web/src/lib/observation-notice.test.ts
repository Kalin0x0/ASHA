import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The strip that tells someone an administrator is watching them is not a
 * component detail — it is the reason this feature may be used at all. Two of
 * its properties live in the structure of the viewers rather than in any
 * function, and the runner is node-only, so neither page can be rendered to
 * check them. They are pinned at source level instead, the way
 * `z-layers.test.ts` pins the stacking order:
 *
 *  • whoever is watching holds the observation window open, because that window
 *    IS the notice and the record behind it lapses after 90 s;
 *  • the element a viewer puts into fullscreen contains the notice, because
 *    element fullscreen paints nothing outside the subtree it was handed.
 */

const SRC = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string): string => readFileSync(join(SRC, path), 'utf8');

const WATCHING_VIEWERS: Array<[string, string]> = [
  ['the guacamole viewer', 'app/connect/[kasmId]/page.tsx'],
  ['the container viewer', 'app/observe/[sessionId]/page.tsx'],
];

describe('a viewer that is watching keeps the window open', () => {
  for (const [name, path] of WATCHING_VIEWERS) {
    it(`${name} renews while it watches and closes the window on the way out`, () => {
      const src = read(path);
      expect(src).toContain('useStartObservation');
      // Renewed well inside the 90 s the watch record lives, and stopped in the
      // effect's cleanup: leaving the viewer is what ends the observation.
      // Without this the banner dies under a watcher who is still watching.
      expect(src).toContain('OBSERVE_RENEW_MS');
      expect(src).toMatch(/window\.clearInterval\(timer\);\s*void stop\w*Ref\.current\(/);
    });
  }

  it('the wall hands its window to the viewer instead of closing it', () => {
    // Navigating to the viewer unmounts the wall, and its cleanup used to stop
    // every open window — including the one it had just minted for this watch.
    expect(read('app/(admin)/sessions/monitor/page.tsx')).toContain('openWindows.current.handOff(');
  });
});

describe('the notice survives fullscreen', () => {
  it('the portal viewer fullscreens the root that carries the notice, not the stage', () => {
    const src = read('app/(portal)/session/[sessionId]/page.tsx');
    const target = /(\w+)\.current\?\.requestFullscreen/.exec(src)?.[1];
    expect(target).toBe('rootRef');
    // The viewer root: control bar, notice and stream are all inside it, so a
    // user working fullscreen — the normal way to use a remote desktop — still
    // sees that they are being watched.
    expect(src).toMatch(/<div ref=\{rootRef\}[^>]*fixed inset-0/);
    expect(src).toContain('<ObservationNotice');
  });
});
