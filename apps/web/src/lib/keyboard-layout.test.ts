import { describe, expect, it } from 'vitest';
import { isRemoteLayout, LAYOUT_CHOICES, LAYOUT_INHERIT, layoutParam, REMOTE_LAYOUTS } from './keyboard-layout';

describe('layoutParam — what the viewer puts in the stream URL', () => {
  it('sends nothing for the default choice, so the server row decides', () => {
    // The viewer knowing better than the machine's own record is the exception,
    // not the rule: without a deliberate correction the URL looks exactly as it
    // did before this control existed.
    expect(layoutParam(LAYOUT_INHERIT)).toBeNull();
  });

  it('sends the layout the user picked', () => {
    expect(layoutParam('en-us-qwerty')).toBe('en-us-qwerty');
  });

  it('sends nothing for anything guacd would not accept', () => {
    // Austria types on a German keyboard and guacd still ships no
    // `de-at-qwertz`; forwarded, it costs the connection, not the keyboard.
    expect(layoutParam('de-at-qwertz')).toBeNull();
    expect(layoutParam('DE-DE-QWERTZ')).toBeNull();
    expect(layoutParam('')).toBeNull();
    expect(layoutParam(null)).toBeNull();
    expect(layoutParam(undefined)).toBeNull();
  });
});

describe('the layouts the viewer offers', () => {
  it('covers every layout the guacd image carries', () => {
    // A shorter list here silently takes layouts away from the people whose
    // desktop is set to one of them.
    expect(REMOTE_LAYOUTS).toHaveLength(18);
    for (const layout of REMOTE_LAYOUTS) expect(isRemoteLayout(layout)).toBe(true);
  });

  it('offers "keep the server setting" first and never as a layout', () => {
    expect(LAYOUT_CHOICES[0]).toBe(LAYOUT_INHERIT);
    expect(isRemoteLayout(LAYOUT_INHERIT)).toBe(false);
    expect(LAYOUT_CHOICES).toHaveLength(REMOTE_LAYOUTS.length + 1);
  });
});
