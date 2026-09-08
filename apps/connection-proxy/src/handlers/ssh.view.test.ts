import { EventEmitter } from 'node:events';
import type { IncomingMessage } from 'node:http';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionRecord } from '../session-store.js';

/**
 * ssh2 stands in for the target host: what matters is whether the handler tries
 * to log in at all, which is only visible in the connect attempts it makes.
 */
const connects: Array<{ host?: string; username?: string }> = [];

vi.mock('ssh2', async () => {
  // vi.mock is hoisted above the imports, so the factory brings its own.
  const { EventEmitter } = await import('node:events');
  class Client extends EventEmitter {
    connect(config: { host?: string; username?: string }): void {
      connects.push(config);
    }
    end(): void {}
  }
  return { Client };
});

const SESSION = {
  sessionId: 's1',
  kasmId: 'k1',
  orgId: 'o1',
  userId: 'u1',
  protocol: 'SSH',
  internalHost: '10.0.0.5',
  internalPort: 22,
  status: 'RUNNING',
  sshUser: 'kasm-user',
  sshPassword: 'secret',
} as unknown as SessionRecord;

const REQ = { url: '/session/k1?token=t' } as IncomingMessage;

class FakeSocket extends EventEmitter {
  readonly OPEN = 1;
  readyState = 1;
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

/** The logger is built at import, so silence it before the module is loaded. */
async function load() {
  vi.resetModules();
  vi.stubEnv('LOG_LEVEL', 'silent');
  return import('./ssh.js');
}

beforeEach(() => {
  connects.length = 0;
});

describe('handleSSH — watching a terminal', () => {
  it('refuses view mode instead of opening a second login on the target', async () => {
    // conn.shell() allocates a NEW pty: an observer would get their own shell
    // under the session user — in the host's auth log, against its session
    // limit — and would see none of the terminal the user is working in.
    const { handleSSH, CLOSE_VIEW_UNSUPPORTED } = await load();
    const ws = new FakeSocket();

    handleSSH(ws as never, REQ, SESSION, 'view');

    expect(connects).toHaveLength(0);
    expect(ws.closeCode).toBe(CLOSE_VIEW_UNSUPPORTED);
  });

  it('still connects the terminal the session belongs to', async () => {
    const { handleSSH } = await load();
    const ws = new FakeSocket();

    handleSSH(ws as never, REQ, SESSION, 'control');

    expect(connects).toHaveLength(1);
    expect(connects[0]).toMatchObject({ host: '10.0.0.5', username: 'kasm-user' });
    expect(ws.closeCode).toBeNull();
  });
});
