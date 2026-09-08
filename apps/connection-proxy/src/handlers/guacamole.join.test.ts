import { EventEmitter } from 'node:events';
import type { IncomingMessage } from 'node:http';
import net, { type AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GuacUuidStore, SessionRecord } from '../session-store.js';
import { encodeInstruction, GuacamoleParser } from './guac-protocol.js';

/**
 * These cases drive the real handler against a stand-in guacd on a loopback
 * port: the decision that matters — join the live connection or open a fresh
 * one — is only visible in the bytes it puts on the wire.
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

const REQ = { url: '/session/k1?token=t&w=1280&h=720' } as IncomingMessage;

/** The parameter list guacd advertises, including the one a join answers 'true'. */
const PARAMS = ['hostname', 'port', 'username', 'password', 'read-only'];

interface Conn {
  sock: net.Socket;
  instructions: string[][];
}

class FakeSocket extends EventEmitter {
  readonly OPEN = 1;
  readyState = 1;
  bufferedAmount = 0;
  sent: string[] = [];
  closeCode: number | null = null;

  send(data: unknown): void {
    this.sent.push(String(data));
  }

  close(code = 1000): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.closeCode = code;
    this.emit('close');
  }
}

function fakeStore(uuid: string | null): GuacUuidStore {
  return {
    getGuacUuid: vi.fn(async () => uuid),
    setGuacUuid: vi.fn(async () => undefined),
    clearGuacUuid: vi.fn(async () => undefined),
  };
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

/** The handler reads GUACD_HOST/PORT once at import, so each case re-imports it. */
async function load(port: number) {
  vi.resetModules();
  // The logger is built at import too, and a bridged desktop stream at debug
  // level buries the test output.
  vi.stubEnv('LOG_LEVEL', 'silent');
  vi.stubEnv('GUACD_HOST', '127.0.0.1');
  vi.stubEnv('GUACD_PORT', String(port));
  return import('./guacamole.js');
}

const select = (conn: Conn) =>
  until(() => conn.instructions.find((i) => i[0] === 'select'), 'select');

/** Answer the handshake the way guacd does, up to `ready`. */
async function completeHandshake(conn: Conn, uuid: string): Promise<string[]> {
  await select(conn);
  conn.sock.write(encodeInstruction('args', 'VERSION_1_5_0', ...PARAMS));
  const connect = await until(() => conn.instructions.find((i) => i[0] === 'connect'), 'connect');
  conn.sock.write(encodeInstruction('ready', `$${uuid}`));
  return connect;
}

describe('handleGuacamole — join an existing connection or open a fresh one', () => {
  it('selects the stored uuid for an observer, so no second logon happens', async () => {
    const { conns, port } = await startGuacd();
    const { handleGuacamole } = await load(port);
    const ws = new FakeSocket();
    teardown.push(() => ws.close());

    await handleGuacamole(ws as never, REQ, SESSION, 'view', fakeStore('conn-uuid'));

    const conn = await until(() => conns[0], 'a guacd connection');
    expect(await select(conn)).toEqual(['select', '$conn-uuid']);
  });

  it('selects the protocol for the session own viewer', async () => {
    const { conns, port } = await startGuacd();
    const { handleGuacamole } = await load(port);
    const ws = new FakeSocket();
    teardown.push(() => ws.close());

    await handleGuacamole(ws as never, REQ, SESSION, 'control', fakeStore('conn-uuid'));

    const conn = await until(() => conns[0], 'a guacd connection');
    expect(await select(conn)).toEqual(['select', 'rdp']);
  });

  it('opens a fresh connection when nothing is stored to join', async () => {
    const { conns, port } = await startGuacd();
    const { handleGuacamole } = await load(port);
    const ws = new FakeSocket();
    teardown.push(() => ws.close());

    await handleGuacamole(ws as never, REQ, SESSION, 'view', fakeStore(null));

    const conn = await until(() => conns[0], 'a guacd connection');
    expect(await select(conn)).toEqual(['select', 'rdp']);
  });

  it('falls back to a fresh connection when guacd refuses the join', async () => {
    // The owner disconnected between publishing the uuid and this join, so the
    // connection it names is gone.
    const { conns, port } = await startGuacd();
    const { handleGuacamole } = await load(port);
    const ws = new FakeSocket();
    teardown.push(() => ws.close());

    await handleGuacamole(ws as never, REQ, SESSION, 'view', fakeStore('stale-uuid'));

    const first = await until(() => conns[0], 'the join attempt');
    expect(await select(first)).toEqual(['select', '$stale-uuid']);
    first.sock.write(encodeInstruction('error', 'No such connection', '519'));

    const second = await until(() => conns[1], 'the fresh connection');
    expect(await select(second)).toEqual(['select', 'rdp']);
    // The abandoned attempt must not take the browser down with it.
    expect(ws.closeCode).toBeNull();
  });

  it('answers every advertised parameter, and read-only true, on a join', async () => {
    const { conns, port } = await startGuacd();
    const { handleGuacamole } = await load(port);
    const ws = new FakeSocket();
    teardown.push(() => ws.close());

    await handleGuacamole(ws as never, REQ, SESSION, 'view', fakeStore('conn-uuid'));
    const conn = await until(() => conns[0], 'a guacd connection');
    const connect = await completeHandshake(conn, 'conn-uuid');

    // guacd rejects the whole connect unless the protocol version is echoed
    // along with a value for every parameter.
    expect(connect).toHaveLength(1 + 1 + PARAMS.length);
    expect(connect[1]).toBe('VERSION_1_5_0');
    expect(connect[2 + PARAMS.indexOf('read-only')]).toBe('true');
    expect(connect[2 + PARAMS.indexOf('hostname')]).toBe('10.0.0.5');
  });

  it('publishes the uuid guacd hands the session own viewer, and withdraws it on close', async () => {
    const { conns, port } = await startGuacd();
    const { handleGuacamole } = await load(port);
    const ws = new FakeSocket();
    const store = fakeStore(null);

    await handleGuacamole(ws as never, REQ, SESSION, 'control', store);
    const conn = await until(() => conns[0], 'a guacd connection');
    const connect = await completeHandshake(conn, 'live-uuid');
    expect(connect[2 + PARAMS.indexOf('read-only')]).toBe('false');

    await until(() => (store.setGuacUuid as ReturnType<typeof vi.fn>).mock.calls.length, 'the uuid');
    expect(store.setGuacUuid).toHaveBeenCalledWith('k1', 'live-uuid');
    // `ready` is forwarded to the browser like everything else — the scan reads
    // the stream, it does not consume it.
    expect(ws.sent.join('')).toContain('ready');

    ws.close();
    expect(store.clearGuacUuid).toHaveBeenCalledWith('k1', 'live-uuid');
  });

  it('never publishes an observer own connection', async () => {
    const { conns, port } = await startGuacd();
    const { handleGuacamole } = await load(port);
    const ws = new FakeSocket();
    teardown.push(() => ws.close());
    const store = fakeStore(null);

    await handleGuacamole(ws as never, REQ, SESSION, 'view', store);
    const conn = await until(() => conns[0], 'a guacd connection');
    await completeHandshake(conn, 'observer-uuid');
    await until(() => ws.sent.length, 'the bridged stream');

    expect(store.setGuacUuid).not.toHaveBeenCalled();
  });
});

describe('handleGuacamole — what reaches guacd from the browser', () => {
  it('forwards an observer acknowledgements and nothing else', async () => {
    const { conns, port } = await startGuacd();
    const { handleGuacamole } = await load(port);
    const ws = new FakeSocket();
    teardown.push(() => ws.close());

    await handleGuacamole(ws as never, REQ, SESSION, 'view', fakeStore('conn-uuid'));
    const conn = await until(() => conns[0], 'a guacd connection');
    await completeHandshake(conn, 'conn-uuid');

    ws.emit('message', '4.sync,4.1234;3.key,5.65289,1.1;5.mouse,3.640,3.480,1.1;');

    const sync = await until(() => conn.instructions.find((i) => i[0] === 'sync'), 'the sync');
    expect(sync).toEqual(['sync', '1234']);
    expect(conn.instructions.some((i) => i[0] === 'key' || i[0] === 'mouse')).toBe(false);
  });

  it('passes the session own viewer through untouched', async () => {
    const { conns, port } = await startGuacd();
    const { handleGuacamole } = await load(port);
    const ws = new FakeSocket();
    teardown.push(() => ws.close());

    await handleGuacamole(ws as never, REQ, SESSION, 'control', fakeStore(null));
    const conn = await until(() => conns[0], 'a guacd connection');
    await completeHandshake(conn, 'live-uuid');

    ws.emit('message', '3.key,5.65289,1.1;');

    const key = await until(() => conn.instructions.find((i) => i[0] === 'key'), 'the keystroke');
    expect(key).toEqual(['key', '65289', '1']);
  });
});
