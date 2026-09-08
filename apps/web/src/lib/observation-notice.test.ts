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
 *    element fullscreen paints nothing outside the subtree it was handed;
 *  • nothing is captured while the watching tab is in the background, which is
 *    the same promise made in words in the wall's own header.
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

  it('the portal viewer never lets the stream frame hold fullscreen', () => {
    // KasmVNC ships its own fullscreen button inside the frame. Granted the
    // permission, that button makes the IFRAME the fullscreen element — and the
    // browser then paints only its subtree, which is the one place in this page
    // the notice is not. The grant is withheld, and because a same-origin frame
    // still inherits the feature from this document's default allowlist, the
    // fullscreen element is checked as well.
    const src = read('app/(portal)/session/[sessionId]/page.tsx');
    expect(src).not.toMatch(/^\s*allowFullScreen$/m);
    expect(/allow="[^"]*fullscreen/.test(src)).toBe(false);
    expect(src).toContain("document.addEventListener('fullscreenchange'");
  });

  it('the guacamole viewer fullscreens the root that carries the notice', () => {
    const src = read('app/connect/[kasmId]/page.tsx');
    // Fullscreen is requested on containerRef — the fixed root that holds the
    // toolbar, the notice and the canvas — not on the stage under it.
    expect(src).toMatch(/const el = containerRef\.current;[\s\S]{0,240}el\.requestFullscreen/);
    expect(src).toMatch(/<div ref=\{containerRef\}[^>]*fixed inset-0/);
    // The notice is a child of that root, overlaid on the stage inside it.
    expect(src).toContain('<ObservationNotice');
  });
});

describe('capture stops with the tab', () => {
  const CAPTURING_SURFACES: Array<[string, string]> = [
    ['the wall', 'app/(admin)/sessions/monitor/page.tsx'],
    ['the live view', 'app/observe/[sessionId]/page.tsx'],
  ];

  for (const [name, path] of CAPTURING_SURFACES) {
    it(`${name} stops asking for frames once its tab is hidden`, () => {
      // An admin who switched away is not watching, and the live view is the
      // expensive one: a 960 px frame every 700 ms, taken inside somebody's
      // desktop, for a picture nobody is looking at.
      const src = read(path);
      expect(src).toContain("document.addEventListener('visibilitychange'");
      expect(src).toContain("document.visibilityState === 'hidden'");
    });
  }
});
