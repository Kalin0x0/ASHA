import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    session: { findFirst: vi.fn() },
    workspace: { findUnique: vi.fn() },
  },
}));

vi.mock('@asha/db', () => ({ prisma: prismaMock }));
vi.mock('../../common/audit.service', () => ({ AuditService: class {} }));
vi.mock('../../common/redis.service', () => ({ RedisService: class {} }));
vi.mock('./scheduler.service', () => ({ SchedulerService: class {} }));

import { SessionsService } from './sessions.service';

const STORED_TOKEN = 'stale.token.minted-at-launch';
const SESSION = {
  id: 'sess1',
  kasmId: 'kid1',
  orgId: 'org1',
  userId: 'user1',
  status: 'RUNNING',
  connectionUrl: `https://asha.example.com/session/kid1/?path=session/kid1/websockify&token=${STORED_TOKEN}`,
  errorMessage: null,
  streamProfile: {},
};

const USER = { sub: 'user1', orgId: 'org1', email: 'user1@x.io', isSystemAdmin: true } as never;

/**
 * The stream token is minted once, when the agent reports RUNNING, and stored
 * inside `connectionUrl`. That was harmless while Traefik's gate accepted every
 * request; now that the gate validates the token, a stored one goes stale after
 * SESSION_TOKEN_TTL and every later visit to a still-running desktop is refused.
 */
describe('SessionsService — stream token freshness', () => {
  let svc: SessionsService;
  let jwt: { signAsync: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    jwt = { signAsync: vi.fn().mockResolvedValue('fresh.token.signed-now') };
    const env = { SESSION_TOKEN_SECRET: 'secret', SESSION_TOKEN_TTL: 120 };
    svc = new SessionsService(
      {} as never, // scheduler
      {} as never, // redis
      { record: vi.fn() } as never, // audit
      undefined, undefined, undefined, undefined, undefined, undefined, undefined,
      jwt as never,
      env as never,
    );
    prismaMock.session.findFirst.mockResolvedValue(SESSION);
    prismaMock.workspace.findUnique.mockResolvedValue({ id: 'ws1', dlp: {} });
  });

  it('signs a fresh token when the viewer asks to connect', async () => {
    const out = await svc.connection('sess1', USER);
    expect(out.connectionUrl).toContain('token=fresh.token.signed-now');
    expect(out.connectionUrl).not.toContain(STORED_TOKEN);
    // Same session, same claims — only the expiry moves.
    expect(jwt.signAsync).toHaveBeenCalledWith(
      { sid: 'sess1', kasmId: 'kid1' },
      expect.objectContaining({ expiresIn: 120 }),
    );
  });

  it('leaves the polled session row alone', async () => {
    // The portal refetches this row every 15 seconds. A token that changed on
    // every poll would swap the stream's src and reload the desktop under the
    // user, so reading a session must not rotate it.
    const out = await svc.get('sess1', USER);
    expect(out.connectionUrl).toContain(STORED_TOKEN);
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });

  it('leaves the rest of the URL byte-for-byte alone', async () => {
    // Rebuilding it through URL/searchParams would percent-escape the slashes in
    // `path=session/<id>/websockify`, which is how the KasmVNC client finds its
    // websocket.
    const out = await svc.connection('sess1', USER);
    expect(out.connectionUrl).toBe(
      'https://asha.example.com/session/kid1/?path=session/kid1/websockify&token=fresh.token.signed-now',
    );
  });

  it('replaces only the token when it is not the last parameter', async () => {
    prismaMock.session.findFirst.mockResolvedValue({
      ...SESSION,
      connectionUrl: `https://asha.example.com/session/kid1/?token=${STORED_TOKEN}&resize=remote`,
    });
    const out = await svc.connection('sess1', USER);
    expect(out.connectionUrl).toBe(
      'https://asha.example.com/session/kid1/?token=fresh.token.signed-now&resize=remote',
    );
  });

  it('leaves a session without a connection URL alone', async () => {
    prismaMock.session.findFirst.mockResolvedValue({ ...SESSION, connectionUrl: null });
    const out = await svc.connection('sess1', USER);
    expect(out.connectionUrl).toBeNull();
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });

  it('does not touch a URL that carries no token (server sessions reach guacd through the proxy)', async () => {
    const plain = 'https://asha.example.com/connect/kid1';
    prismaMock.session.findFirst.mockResolvedValue({ ...SESSION, connectionUrl: plain });
    const out = await svc.connection('sess1', USER);
    expect(out.connectionUrl).toBe(plain);
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });

  it('still returns the session when signing fails', async () => {
    jwt.signAsync.mockRejectedValue(new Error('key unavailable'));
    const out = await svc.connection('sess1', USER);
    expect(out.connectionUrl).toContain(STORED_TOKEN);
  });
});
