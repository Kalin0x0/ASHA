import { describe, expect, it } from 'vitest';
import { forwardsToRemote, KEYSYM_ALTGR } from './remote-keys';

/**
 * The sequence below is what guacamole-common-js 1.5 actually emits for AltGr+Q
 * on a German keyboard, captured from the library in a browser:
 *
 *   DOWN 0xffe3  Ctrl_L        (Windows reports AltGr as Ctrl+Alt)
 *   DOWN 0xfe03  ISO_Level3_Shift
 *   UP   0xffe3  Ctrl_L        (release_simulated_altgr lifts the pair …)
 *   DOWN 0x40    '@'           (… but not the ISO_Level3_Shift it made itself)
 *   UP   0x40
 *   UP   0xfe03
 *
 * The '@' therefore reaches guacd with AltGr held, while guacd is about to press
 * AltGr itself to type '@' in the German server layout. The two cancel and
 * nothing arrives. Everything but the AltGr keysym belongs on the wire.
 */
const ALTGR_Q = [
  { keysym: 0xffe3, down: true },
  { keysym: KEYSYM_ALTGR, down: true },
  { keysym: 0xffe3, down: false },
  { keysym: 0x40, down: true },
  { keysym: 0x40, down: false },
  { keysym: KEYSYM_ALTGR, down: false },
];

describe('forwardsToRemote', () => {
  it('swallows AltGr and nothing else in the AltGr+Q sequence', () => {
    const forwarded = ALTGR_Q.filter((e) => forwardsToRemote(e.keysym)).map((e) => e.keysym);
    expect(forwarded).toEqual([0xffe3, 0xffe3, 0x40, 0x40]);
    expect(forwarded).not.toContain(KEYSYM_ALTGR);
  });

  it('lets the whole AltGr row through as plain characters', () => {
    // @ \ | { } [ ] ~ € — most of what writing code or an address needs.
    for (const cp of [0x40, 0x5c, 0x7c, 0x7b, 0x7d, 0x5b, 0x5d, 0x7e, 0x20ac]) {
      expect(forwardsToRemote(cp)).toBe(true);
    }
  });

  it('leaves the real modifiers alone', () => {
    // Ctrl, Alt, Shift, Super and Ctrl+Alt+Del still have to reach the desktop.
    for (const keysym of [0xffe3, 0xffe4, 0xffe9, 0xffea, 0xffe1, 0xffe2, 0xffeb, 0xffff]) {
      expect(forwardsToRemote(keysym)).toBe(true);
    }
  });

  it('names the keysym it swallows', () => {
    // ISO_Level3_Shift. A wrong constant here would silently do nothing at all.
    expect(KEYSYM_ALTGR).toBe(0xfe03);
    expect(forwardsToRemote(KEYSYM_ALTGR)).toBe(false);
  });
});
