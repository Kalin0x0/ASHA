import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SessionRecord } from '../session-store.js';

const SESSION = {
  sessionId: 's1',
  kasmId: 'k1',
  orgId: 'o1',
  userId: 'u1',
  protocol: 'RDP',
  internalHost: '10.0.0.5',
  internalPort: 3389,
  status: 'RUNNING',
  rdpUser: 'user',
  rdpPassword: 'secret',
} as unknown as SessionRecord;

/** The module reads its env once at import, so each case needs a fresh import. */
async function load(env: Record<string, string | undefined> = {}) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return import('./guacamole.js');
}

afterEach(() => {
  delete process.env.GUAC_RDP_SERVER_LAYOUT;
});

describe('resolveParam — what guacd is told about an RDP desktop', () => {
  it('keeps the motion effects off', async () => {
    // Aero translucency, dragging a window with its contents and animated menus
    // change nothing on a still screen but turn every interaction into a stream
    // of repaints — the thing users feel as a sluggish desktop.
    const { resolveParam } = await load();
    expect(resolveParam('enable-desktop-composition', SESSION)).toBe('false');
    expect(resolveParam('enable-full-window-drag', SESSION)).toBe('false');
    expect(resolveParam('enable-menu-animations', SESSION)).toBe('false');
  });

  it('keeps the appearance on, so the desktop is not a black background', async () => {
    const { resolveParam } = await load();
    expect(resolveParam('enable-wallpaper', SESSION)).toBe('true');
    expect(resolveParam('enable-theming', SESSION)).toBe('true');
    expect(resolveParam('enable-font-smoothing', SESSION)).toBe('true');
  });

  it('passes the configured server keyboard layout through', async () => {
    const { resolveParam } = await load({ GUAC_RDP_SERVER_LAYOUT: 'de-de-qwertz' });
    expect(resolveParam('server-layout', SESSION)).toBe('de-de-qwertz');
  });

  it('leaves the layout to guacd when nothing is configured', async () => {
    const { resolveParam } = await load({ GUAC_RDP_SERVER_LAYOUT: undefined });
    expect(resolveParam('server-layout', SESSION)).toBe('');
  });

  it('still sends the credentials and the host', async () => {
    const { resolveParam } = await load();
    expect(resolveParam('hostname', SESSION)).toBe('10.0.0.5');
    expect(resolveParam('port', SESSION)).toBe('3389');
    expect(resolveParam('username', SESSION)).toBe('user');
    expect(resolveParam('password', SESSION)).toBe('secret');
    // NLA needs guacd to actually send them.
    expect(resolveParam('disable-auth', SESSION)).toBe('false');
  });

  it('answers unknown parameters with an empty string, never undefined', async () => {
    // guacd rejects the whole connect if any advertised parameter is missing.
    const { resolveParam } = await load();
    expect(resolveParam('something-guacd-invented-later', SESSION)).toBe('');
  });
});
