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

describe('the read-only observation route', () => {
  it('carries no credential of its own, because a label cannot be rotated', async () => {
    await provisionContainer(CMD);

    // The write-capable route keeps its baked-in header — it is the session's
    // own credential and lives exactly as long as the session does.
    expect(basic('sess-kid1-auth').startsWith('kasm_user:')).toBe(true);
    // The observe route must NOT: a container label cannot change while the
    // container runs, so a kasm_viewer password baked in here would be one
    // password for the whole session — good long after the two-minute grant it
    // was handed out for expired. The password is minted per observation and the
    // forward-auth gate puts it on the request instead.
    const observeLabels = Object.keys(labels()).filter((k) => k.includes('sess-kid1-observe'));
    expect(observeLabels.length).toBeGreaterThan(0);
    expect(observeLabels.some((k) => k.includes('customrequestheaders'))).toBe(false);
    expect(Object.values(labels()).some((v) => v.includes('kasm_viewer'))).toBe(false);
    expect(Object.values(labels()).some((v) => Buffer.from(v, 'base64').toString().includes('kasm_viewer'))).toBe(
      false,
    );
    // Nor in the env, where the desktop's own user could read it back out.
    expect(env()).toContainEqual(expect.stringMatching(/^VNC_PW=/));
    expect(env().some((e) => e.includes('kasm_viewer'))).toBe(false);
  });

  it('keeps the observe route gated, so losing the header does not open it', async () => {
    await provisionContainer(CMD);

    // sess-auth reads the session id out of the request path, so it has to run
    // ahead of the prefix strip — and here it is load-bearing twice over,
    // because it is also what authenticates the route now.
    expect(labels()['traefik.http.routers.sess-kid1-observe.middlewares']).toBe(
      'sess-auth@file,sess-kid1-observe-strip',
    );
    expect(labels()['traefik.http.middlewares.sess-kid1-observe-strip.stripprefix.prefixes']).toBe(
      '/session/kid1/observe',
    );
  });

  it('routes the longer prefix to its own service on the same stream port', async () => {
    await provisionContainer(CMD);

    const l = labels();
    expect(l['traefik.http.routers.sess-kid1-observe.rule']).toBe('PathPrefix(`/session/kid1/observe`)');
    // Above the session router, which matches the same request on a shorter prefix.
    expect(Number(l['traefik.http.routers.sess-kid1-observe.priority'])).toBeGreaterThan(0);
    // Mandatory with more than one service on the container — without it Traefik
    // refuses to link ANY router on it.
    expect(l['traefik.http.routers.sess-kid1-observe.service']).toBe('sess-kid1-observe');
    expect(l['traefik.http.services.sess-kid1-observe.loadbalancer.server.port']).toBe('6901');
    expect(l['traefik.http.services.sess-kid1-observe.loadbalancer.server.scheme']).toBe('https');
    expect(l['traefik.http.services.sess-kid1-observe.loadbalancer.serverstransport']).toBe('asha-insecure@file');
  });

  it('leaves a fixed-server session alone', async () => {
    await provisionContainer({ ...CMD, protocol: 'RDP' });

    expect(Object.keys(labels()).some((k) => k.includes('-observe'))).toBe(false);
    expect(scripts().some((s) => s.includes('kasmvncpasswd'))).toBe(false);
  });
});

describe('probing for the read-only account', () => {
  it('runs as the session user, because kasm-user owns .kasmpasswd', async () => {
    await provisionContainer(CMD);

    const call = execMock.mock.calls.find((c) => ((c[0] as { Cmd: string[] }).Cmd[2] ?? '').includes('kasmvncpasswd'));
    expect(call).toBeDefined();
    expect((call![0] as { User?: string }).User).toBeUndefined();
    expect((call![0] as { Cmd: string[] }).Cmd[0]).toBe('/bin/sh');
  });

  it('writes no password at launch, because one written then never expires', async () => {
    await provisionContainer(CMD);

    // Provisioning only asks whether the image COULD mint the account. Creating
    // it here is what made the observer's credential outlive their grant by the
    // rest of the session.
    const script = scripts().find((s) => s.includes('kasmvncpasswd')) ?? '';
    expect(script).toContain('command -v kasmvncpasswd');
    expect(script).not.toContain('kasm_viewer');
    expect(scripts().some((s) => s.includes('.kasmpasswd'))).toBe(false);
  });

  it('reports no viewer account when the image has no kasmvncpasswd', async () => {
    const result = await provisionContainer(CMD);

    const script = scripts().find((s) => s.includes('kasmvncpasswd')) ?? '';
    // The guard keeps a third-party image from failing its session; the exit
    // code is what tells the manager the read-only route would answer nobody.
    expect(script).toContain('command -v kasmvncpasswd >/dev/null 2>&1');
    expect(result.containerId).toBe('container1');
    expect(result.viewerAuth).toBe(false);
  });

  it('reports the viewer account once kasmvncpasswd confirms it', async () => {
    // One Docker multiplex frame (stream 1, 2 bytes) carrying the marker the
    // script prints only when the tool is present.
    const payload = Buffer.from('ok', 'utf8');
    const frame = Buffer.concat([Buffer.from([1, 0, 0, 0, 0, 0, 0, payload.length]), payload]);
    execMock.mockImplementation(() => {
      const stream = new EventEmitter() as EventEmitter & { destroy: () => void };
      stream.destroy = () => undefined;
      setImmediate(() => {
        stream.emit('data', frame);
        stream.emit('end');
      });
      return Promise.resolve({ start: () => Promise.resolve(stream) });
    });

    const result = await provisionContainer(CMD);

    expect(result.viewerAuth).toBe(true);
  });

  it('does not fail the session when the exec itself is refused', async () => {
    // A third-party image can refuse the exec outright. Losing the read-only
    // route is a degraded observation; losing the desktop is not acceptable.
    execMock.mockImplementation((opts: { Cmd: string[] }) =>
      (opts.Cmd[2] ?? '').includes('kasmvncpasswd')
        ? Promise.reject(new Error('OCI runtime exec failed'))
        : Promise.resolve({ start: () => Promise.resolve(undefined) }),
    );

    await expect(provisionContainer(CMD)).resolves.toMatchObject({
      containerId: 'container1',
      routerName: 'sess-kid1',
    });
  });
});
