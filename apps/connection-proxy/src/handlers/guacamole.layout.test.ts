import { EventEmitter } from 'node:events';
import type { IncomingMessage } from 'node:http';
import net, { type AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SessionRecord } from '../session-store.js';
import { encodeInstruction, GuacamoleParser } from './guac-protocol.js';

/**
 * The keyboard layout is only ever visible in the `connect` instruction the
 * proxy writes, so these cases drive the real handler against a stand-in guacd
 * on a loopback port and read the value back off the wire.
 */

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

const VNC_SESSION = { ...SESSION, protocol: 'VNC', internalPort: 5900 } as unknown as SessionRecord;

/** What guacd advertises — the VNC client has no `server-layout` to advertise. */
const RDP_PARAMS = ['hostname', 'port', 'username', 'password', 'server-layout', 'read-only'];
const VNC_PARAMS = ['hostname', 'port', 'password', 'color-depth', 'read-only'];

interface Conn {
  sock: net.Socket;
  instructions: string[][];
}

class FakeSocket extends EventEmitter {
  readonly OPEN = 1;
  readyState = 1;
  bufferedAmount = 0;
  sent: string[] = [];

  send(data: unknown): void {
    this.sent.push(String(data));
  }

  close(): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.emit('close');
  }
}

async function until<T>(probe: () => T | undefined | null | false, label: string): Promise<T> {
  const deadline = Date.now() + 2000;
  for (;;) {
    const value = probe();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 5));
  }
}

const teardown: Array<() => void> = [];

afterEach(() => {
  while (teardown.length) teardown.pop()?.();
  vi.unstubAllEnvs();
});

/** A guacd that records what it is told and answers only when the test says so. */
async function startGuacd(): Promise<{ conns: Conn[]; port: number }> {
  const conns: Conn[] = [];
  const server = net.createServer((sock) => {
    const conn: Conn = { sock, instructions: [] };
    const parser = new GuacamoleParser();
    sock.on('data', (b: Buffer) => conn.instructions.push(...parser.push(b.toString('utf8'))));
    sock.on('error', () => undefined);
    conns.push(conn);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  teardown.push(() => {
    for (const c of conns) c.sock.destroy();
    server.close();
  });
  return { conns, port: (server.address() as AddressInfo).port };
}

/** The handler reads GUACD_HOST/PORT and the layout default once at import. */
async function load(port: number, deploymentLayout: string) {
  vi.resetModules();
  vi.stubEnv('LOG_LEVEL', 'silent');
  vi.stubEnv('GUACD_HOST', '127.0.0.1');
  vi.stubEnv('GUACD_PORT', String(port));
  vi.stubEnv('GUAC_RDP_SERVER_LAYOUT', deploymentLayout);
  return import('./guacamole.js');
}

/**
 * Drive one connection to `connect` and pair each answer with its parameter.
 * `query` is what the viewer appended to the stream URL, `session` carries what
 * the API wrote for this session, and `deploymentLayout` is the environment.
 */
async function connectValues(
  query: string,
  session: SessionRecord,
  params: string[],
  deploymentLayout: string,
): Promise<Record<string, string>> {
  const { conns, port } = await startGuacd();
  const { handleGuacamole } = await load(port, deploymentLayout);
  const ws = new FakeSocket();
  teardown.push(() => ws.close());

  const req = { url: `/session/k1?token=t&w=1280&h=720${query}` } as IncomingMessage;
  await handleGuacamole(ws as never, req, session);

  const conn = await until(() => conns[0], 'a guacd connection');
  await until(() => conn.instructions.find((i) => i[0] === 'select'), 'select');
  conn.sock.write(encodeInstruction('args', 'VERSION_1_5_0', ...params));
  const connect = await until(() => conn.instructions.find((i) => i[0] === 'connect'), 'connect');
  return Object.fromEntries(params.map((name, i) => [name, connect[2 + i]]));
}

/** The same session with a layout on it, as the API writes it for a Server row. */
const withLayout = (layout: string) => ({ ...SESSION, keyboardLayout: layout }) as SessionRecord;

describe('handleGuacamole — which keyboard layout guacd is told about', () => {
  it('lets the viewer overrule both the server row and the deployment', async () => {
    // The escape hatch: the host is registered wrong and the person in front of
    // the desktop fixes it themselves rather than waiting for an admin.
    const values = await connectValues('&layout=en-us-qwerty', withLayout('fr-fr-azerty'), RDP_PARAMS, 'de-de-qwertz');
    expect(values['server-layout']).toBe('en-us-qwerty');
  });

  it('takes the server row over the deployment default', async () => {
    // The whole complaint: one value for the installation, and three Windows
    // machines that are not configured alike.
    const values = await connectValues('', withLayout('en-us-qwerty'), RDP_PARAMS, 'de-de-qwertz');
    expect(values['server-layout']).toBe('en-us-qwerty');
  });

  it('falls through to the deployment default when the server row names none', async () => {
    // Every host registered before the column existed, and every container
    // desktop, arrives here — they have to come up exactly as they did before.
    const values = await connectValues('', SESSION, RDP_PARAMS, 'de-de-qwertz');
    expect(values['server-layout']).toBe('de-de-qwertz');
  });

  it('falls through to guacd itself when nothing at all names a layout', async () => {
    // An empty value is what tells guacd to keep its own default; sending a
    // placeholder would be sending a layout nobody chose.
    const values = await connectValues('', SESSION, RDP_PARAMS, '');
    expect(values['server-layout']).toBe('');
  });

  it('ignores a viewer layout guacd would reject and asks the server row', async () => {
    // A rejected name costs the whole connection, so it is dropped here rather
    // than forwarded — and dropping it must not skip a step of the precedence.
    const values = await connectValues('&layout=de-at-qwertz', withLayout('en-gb-qwerty'), RDP_PARAMS, 'de-de-qwertz');
    expect(values['server-layout']).toBe('en-gb-qwerty');
  });

  it('ignores a server row guacd would reject and asks the deployment', async () => {
    // The column is validated at the API, but a record can predate that or be
    // written by hand into Redis; either way it must not reach a connect
    // instruction.
    const values = await connectValues('', withLayout('de-at-qwertz'), RDP_PARAMS, 'de-de-qwertz');
    expect(values['server-layout']).toBe('de-de-qwertz');
  });

  it('never answers a VNC parameter with a layout', async () => {
    // guacd's VNC client asks for no layout, so a layout on a VNC session must
    // land nowhere at all — not in the parameter that happens to sit where
    // `server-layout` sits on RDP.
    const session = { ...VNC_SESSION, keyboardLayout: 'de-de-qwertz' } as SessionRecord;
    const values = await connectValues('&layout=fr-fr-azerty', session, VNC_PARAMS, 'de-de-qwertz');
    expect(Object.values(values)).not.toContain('fr-fr-azerty');
    expect(Object.values(values)).not.toContain('de-de-qwertz');
    // The handshake did run — otherwise the assertions above prove nothing.
    expect(values.hostname).toBe('10.0.0.5');
  });
});
