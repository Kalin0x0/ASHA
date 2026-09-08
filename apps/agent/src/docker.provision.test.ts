import { EventEmitter } from 'node:events';
import type { ProvisionCommand } from '@asha/events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createContainerMock, execMock } = vi.hoisted(() => ({
  createContainerMock: vi.fn(),
  execMock: vi.fn(),
}));

vi.mock('dockerode', () => ({
  default: class {
    getImage() {
      return { inspect: () => Promise.resolve({}) };
    }
    createContainer(opts: unknown) {
      return createContainerMock(opts);
    }
  },
}));

// The readiness probe dials the container; answer immediately so provisioning
// reaches the bootstrap execs instead of sitting on a 30 s deadline.
vi.mock('node:net', () => ({
  default: {
    connect: () => {
      const socket = new EventEmitter() as EventEmitter & { destroy: () => void };
      socket.destroy = () => undefined;
      setImmediate(() => socket.emit('connect'));
      return socket;
    },
  },
}));

import { provisionContainer } from './docker.js';

const CMD: ProvisionCommand = {
  sessionId: 'sess1',
  kasmId: 'kid1',
  orgId: 'org1',
  workspaceId: 'ws1',
  zone: 'default',
  protocol: 'KASMVNC',
  runConfig: { dockerImage: 'kasmweb/firefox:1.16.0', env: {}, ports: [6901] },
};

/** Labels the last provisioning attached to the container. */
const labels = (): Record<string, string> =>
  (createContainerMock.mock.calls[0][0] as { Labels: Record<string, string> }).Labels;

/** Env the last provisioning gave the container, as KEY=value strings. */
const env = (): string[] => (createContainerMock.mock.calls[0][0] as { Env: string[] }).Env;

/** The shell scripts run inside the container after it started. */
const scripts = (): string[] =>
  execMock.mock.calls.map((call) => (call[0] as { Cmd: string[] }).Cmd[2] ?? '');

/** Basic credential a header middleware carries, decoded back to user:password. */
const basic = (middleware: string): string => {
  const header = labels()[`traefik.http.middlewares.${middleware}.headers.customrequestheaders.Authorization`];
  return Buffer.from((header ?? '').replace(/^Basic /, ''), 'base64').toString();
};

beforeEach(() => {
  vi.clearAllMocks();
  execMock.mockResolvedValue({ start: () => Promise.resolve(undefined) });
  createContainerMock.mockResolvedValue({
    id: 'container1',
    start: () => Promise.resolve(undefined),
    inspect: () => Promise.resolve({ NetworkSettings: { Networks: { 'asha-sessions': { IPAddress: '10.0.0.2' } } } }),
    exec: execMock,
  });
});

describe('the observe route, which must not come back', () => {
  it('registers no observe router, middleware or service', async () => {
    await provisionContainer(CMD);

    // A container label cannot be rotated while the container runs, so any
    // credential put on a per-session route is good for the whole session — the
    // reason three attempts at a read-only KasmVNC route each ended with an
    // observer holding one longer than their grant. A container desktop is now
    // watched through the capture stream, which has no route, no cookie and no
    // credential, so none of these labels may reappear.
    expect(Object.keys(labels()).filter((k) => k.includes('-observe'))).toEqual([]);
    expect(Object.values(labels()).some((v) => v.includes('/observe'))).toBe(false);
  });

  it('mints no read-only KasmVNC account, in a label, the env or an exec', async () => {
    await provisionContainer(CMD);

    expect(Object.values(labels()).some((v) => v.includes('kasm_viewer'))).toBe(false);
    expect(
      Object.values(labels()).some((v) => Buffer.from(v, 'base64').toString().includes('kasm_viewer')),
    ).toBe(false);
    expect(env().some((e) => e.includes('kasm_viewer'))).toBe(false);
    expect(scripts().some((s) => s.includes('kasmvncpasswd'))).toBe(false);
  });

  it('leaves the write route the desktop owner uses exactly as it was', async () => {
    await provisionContainer(CMD);

    // Nobody watching anything must cost the person at the desktop their way in:
    // the session router keeps its own Basic credential, its forward-auth and
    // its prefix strip, in that order.
    expect(basic('sess-kid1-auth').startsWith('kasm_user:')).toBe(true);
    expect(labels()['traefik.http.routers.sess-kid1.middlewares']).toBe(
      'sess-auth@file,sess-kid1-strip,sess-kid1-auth',
    );
    expect(env()).toContainEqual(expect.stringMatching(/^VNC_PW=/));
  });

  it('still bootstraps the printer, so removing the probe took nothing else with it', async () => {
    await provisionContainer(CMD);

    expect(scripts().some((s) => s.includes('cupsd'))).toBe(true);
  });
});
