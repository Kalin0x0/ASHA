import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Stacking-order guard.
 *
 * The session viewers render through `createPortal(..., document.body)` and Radix
 * mounts dialogs, menus and tooltips into `<body>` as well, so nothing but
 * z-index decides which of them the user actually sees. When the viewer was
 * raised to a hand-written `z-[100]` while the shared dialog stayed on Tailwind's
 * `z-50`, ending a session broke in the worst possible way: the confirmation
 * dialog rendered *behind* an opaque full-screen surface, so `await confirm()`
 * never resolved and the DELETE never ran — and because Radix sets
 * `body { pointer-events: none }` for an open modal, the invisible dialog froze
 * the entire viewer, Back included. From the outside: "End does nothing and Back
 * doesn't work either."
 *
 * These assertions are source-level on purpose. The failure is a *layout*
 * property of the built stylesheet, not of any one component's behaviour, so the
 * only thing that keeps it from coming back is pinning the layers themselves.
 */

const SRC = fileURLToPath(new URL('..', import.meta.url));
const css = readFileSync(join(SRC, 'app/globals.css'), 'utf8');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');

function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) tsxFiles(full, out);
    else if (entry.name.endsWith('.tsx')) out.push(full);
  }
  return out;
}

function layer(name: string): number {
  const match = new RegExp(`--z-index-${name}:\\s*(\\d+)\\s*;`).exec(css);
  expect(match, `globals.css must define --z-index-${name}`).not.toBeNull();
  return Number(match![1]);
}

describe('z-index layers', () => {
  it('orders the scale overlay < viewer < floating < modal', () => {
    const overlay = layer('overlay');
    const viewer = layer('viewer');
    const floating = layer('floating');
    const modal = layer('modal');
    expect(overlay).toBeLessThan(viewer);
    // The whole point: a dialog or menu opened from inside a streaming desktop
    // has to paint on top of it, never behind it.
    expect(viewer).toBeLessThan(floating);
    expect(floating).toBeLessThan(modal);
  });

  it('puts the shared dialog — and therefore useConfirm — on the modal layer', () => {
    const dialog = read('components/ui/dialog.tsx');
    // Overlay and content both: an overlay left behind the viewer would still
    // swallow the click that dismisses the dialog.
    expect(dialog.match(/z-modal/g)).toHaveLength(2);
    expect(dialog).not.toMatch(/\bz-50\b/);

    const palette = read('components/shell/command-palette.tsx');
    expect(palette.match(/z-modal/g)).toHaveLength(2);
  });

  it('puts tooltips, dropdowns and popovers on the floating layer', () => {
    for (const file of ['components/ui/tooltip.tsx', 'components/ui/dropdown-menu.tsx', 'components/ui/popover.tsx']) {
      expect(read(file), file).toMatch(/\bz-floating\b/);
      expect(read(file), file).not.toMatch(/\bz-50\b/);
    }
  });

  it('keeps both full-screen viewers on the viewer layer', () => {
    for (const file of ['app/(portal)/session/[sessionId]/page.tsx', 'app/connect/[kasmId]/page.tsx']) {
      const source = read(file);
      expect(source, file).toMatch(/fixed inset-0 z-viewer/);
    }
  });

  it('forbids hand-written z-index values anywhere in the app', () => {
    // `z-[100]` on the viewer is precisely how this broke. An arbitrary value
    // cannot be compared against the scale, so the scale is the only way in.
    // File-wide, not per-line: multi-line `cn(...)` class lists are exactly where
    // a stray z-index would hide from a `className`-anchored search.
    const offenders = tsxFiles(SRC)
      .filter((f) => /\bz-\[/.test(readFileSync(f, 'utf8')))
      .map((f) => f.slice(SRC.length));
    expect(offenders).toEqual([]);
  });
});
