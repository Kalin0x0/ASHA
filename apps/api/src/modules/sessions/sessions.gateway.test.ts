import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: { session: { findFirst: vi.fn() } },
}));

vi.mock('@asha/db', () => ({ prisma: prismaMock }));

import { SessionsGateway } from './sessions.gateway';

interface FakeSocket {
  handshake: { auth?: Record<string, unknown>; query: Record<string, unknown> };
  join: ReturnType<typeof vi.fn>;
  emit: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
}

function socket(handshake: Partial<FakeSocket['handshake']>): FakeSocket {
  return { handshake: { query: {}, ...handshake }, join: vi.fn(), emit: vi.fn(), disconnect: vi.fn() };
}

const PAYLOAD = { sub: 'user1', orgId: 'org1', email: 'u@x.io', isSystemAdmin: false };
const NOBODY_WATCHING = { sessionId: 'sess1', observerName: '', since: '2026-09-08T10:00:00.000Z', active: false };
const WATCHED = { sessionId: 'sess1', observerName: 'Ada Lovelace', since: '2026-09-08T10:00:00.000Z', active: true };

/**
 * The handshake used to take `orgId` straight from `handshake.query`, so any
 * client could sit in another tenant's room, and the session room was joined
 * with no ownership check at all. Session status, stats and observation
 * thumbnails all travel through these rooms.
 */
describe('SessionsGateway handshake', () => {
  let gateway: SessionsGateway;
  let jwt: { verifyAsync: ReturnType<typeof vi.fn> };
  let rbac: { effectivePermissions: ReturnType<typeof vi.fn> };
  let sessions: { observedState: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    jwt = { verifyAsync: vi.fn().mockResolvedValue(PAYLOAD) };
    rbac = { effectivePermissions: vi.fn().mockResolvedValue(new Set<string>()) };
    sessions = { observedState: vi.fn().mockResolvedValue(NOBODY_WATCHING) };
    gateway = new SessionsGateway(
      jwt as never,
      rbac as never,
      sessions as never,
      { JWT_ACCESS_SECRET: 'access-secret' } as never,
    );
  });

  it('joins the org from the verified payload, not from the query string', async () => {
    const client = socket({ auth: { token: 'good' }, query: { orgId: 'victim-org' } });
    await gateway.handleConnection(client as never);
    expect(jwt.verifyAsync).toHaveBeenCalledWith('good', { secret: 'access-secret' });
    expect(client.join).toHaveBeenCalledWith('org:org1');
    expect(client.join).not.toHaveBeenCalledWith('org:victim-org');
  });

  it('accepts the token from the query string too, for callers that can only build a URL', async () => {
    const client = socket({ query: { token: 'good' } });
    await gateway.handleConnection(client as never);
    expect(client.join).toHaveBeenCalledWith('org:org1');
  });

  it('drops a socket with no token', async () => {
    const client = socket({ query: { orgId: 'org1' } });
    await gateway.handleConnection(client as never);
    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(client.join).not.toHaveBeenCalled();
  });

  it('drops a socket whose token does not verify', async () => {
    jwt.verifyAsync.mockRejectedValue(new Error('expired'));
    const client = socket({ auth: { token: 'forged' } });
    await gateway.handleConnection(client as never);
    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(client.join).not.toHaveBeenCalled();
  });

  it('drops a socket presenting an observation watch token', async () => {
    // A watch token verifies under this secret — the connection-proxy holds no
    // other — but it is a capability for one desktop. Accepting it here would
    // let anyone who read it out of a URL join the observing admin's rooms.
    jwt.verifyAsync.mockResolvedValue({ ...PAYLOAD, kasmId: 'kid1', mode: 'view', typ: 'watch' });
    const client = socket({ auth: { token: 'watch-token' } });
    await gateway.handleConnection(client as never);
    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(client.join).not.toHaveBeenCalled();
  });

  it('keeps a plain user out of the room desktop frames travel through', async () => {
    // The org room is joined on org membership alone, so anything sensitive in
    // it is readable by every colleague. Observation samples carry a WebP of the
    // desktop and the title of the focused window.
    const client = socket({ auth: { token: 'good' } });
    await gateway.handleConnection(client as never);
    expect(client.join).toHaveBeenCalledWith('org:org1');
    expect(client.join).not.toHaveBeenCalledWith('observe:org1:user1');
  });

  it('joins the observation room for a real SESSION_OBSERVE holder', async () => {
    rbac.effectivePermissions.mockResolvedValue(new Set(['SESSION_OBSERVE']));
    const client = socket({ auth: { token: 'good' } });
    await gateway.handleConnection(client as never);
    expect(client.join).toHaveBeenCalledWith('observe:org1:user1');
  });

  it('gives each observer a room of their own, not one the org shares', async () => {
    // A frame of a desktop belongs to whoever holds the window it was captured
    // for. One room per org served it to every colleague holding the permission
    // — outside the audit row naming the watcher and outside the notice on the
    // watched person's screen, both of which belong to the hold.
    rbac.effectivePermissions.mockResolvedValue(new Set(['SESSION_OBSERVE']));
    const client = socket({ auth: { token: 'good' } });
    await gateway.handleConnection(client as never);
    const rooms = client.join.mock.calls.map((c) => c[0] as string);
    expect(rooms.filter((r) => r.startsWith('observe:'))).toEqual(['observe:org1:user1']);
  });

  it('joins the observation room for a system admin without a lookup', async () => {
    jwt.verifyAsync.mockResolvedValue({ ...PAYLOAD, isSystemAdmin: true });
    const client = socket({ auth: { token: 'good' } });
    await gateway.handleConnection(client as never);
    expect(client.join).toHaveBeenCalledWith('observe:org1:user1');
    expect(rbac.effectivePermissions).not.toHaveBeenCalled();
  });

  it('joins the observation room on the wildcard permission', async () => {
    rbac.effectivePermissions.mockResolvedValue(new Set(['*']));
    const client = socket({ auth: { token: 'good' } });
    await gateway.handleConnection(client as never);
    expect(client.join).toHaveBeenCalledWith('observe:org1:user1');
  });

  it('scopes the observation room to the verified org, never the query string', async () => {
    rbac.effectivePermissions.mockResolvedValue(new Set(['SESSION_OBSERVE']));
    const client = socket({ auth: { token: 'good' }, query: { orgId: 'victim-org' } });
    await gateway.handleConnection(client as never);
    expect(client.join).not.toHaveBeenCalledWith('observe:victim-org:user1');
  });

  it('joins the session room for its owner', async () => {
    prismaMock.session.findFirst.mockResolvedValue({ userId: 'user1', kasmId: 'kid1' });
    const client = socket({ auth: { token: 'good' }, query: { sessionId: 'sess1' } });
    await gateway.handleConnection(client as never);
    expect(prismaMock.session.findFirst).toHaveBeenCalledWith({
      where: { id: 'sess1', orgId: 'org1' },
      select: { userId: true, kasmId: true },
    });
    expect(client.join).toHaveBeenCalledWith('session:sess1');
  });

  it('takes the session room from the auth payload as well as the query', async () => {
    prismaMock.session.findFirst.mockResolvedValue({ userId: 'user1', kasmId: 'kid1' });
    const client = socket({ auth: { token: 'good', sessionId: 'sess1' } });
    await gateway.handleConnection(client as never);
    expect(client.join).toHaveBeenCalledWith('session:sess1');
  });

  it('joins the session room for a SESSION_VIEW_ANY holder', async () => {
    prismaMock.session.findFirst.mockResolvedValue({ userId: 'someone-else', kasmId: 'kid1' });
    rbac.effectivePermissions.mockResolvedValue(new Set(['SESSION_VIEW_ANY']));
    const client = socket({ auth: { token: 'good' }, query: { sessionId: 'sess1' } });
    await gateway.handleConnection(client as never);
    expect(client.join).toHaveBeenCalledWith('session:sess1');
  });

  it('keeps a plain user out of someone else’s session room', async () => {
    prismaMock.session.findFirst.mockResolvedValue({ userId: 'someone-else', kasmId: 'kid1' });
    const client = socket({ auth: { token: 'good' }, query: { sessionId: 'sess1' } });
    await gateway.handleConnection(client as never);
    expect(client.join).toHaveBeenCalledWith('org:org1');
    expect(client.join).not.toHaveBeenCalledWith('session:sess1');
    // Asking for the wrong room is a mistake, not an attack: the socket keeps
    // the org events it is entitled to.
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it('keeps a user out of a session in another org', async () => {
    // The org filter is written out because a handshake never passes through the
    // tenant interceptor; a foreign id simply finds nothing.
    prismaMock.session.findFirst.mockResolvedValue(null);
    const client = socket({ auth: { token: 'good' }, query: { sessionId: 'foreign' } });
    await gateway.handleConnection(client as never);
    expect(client.join).not.toHaveBeenCalledWith('session:foreign');
  });

  it('ignores a repeated sessionId parameter instead of handing Prisma an array', async () => {
    const client = socket({ auth: { token: 'good' }, query: { sessionId: ['a', 'b'] } });
    await gateway.handleConnection(client as never);
    expect(prismaMock.session.findFirst).not.toHaveBeenCalled();
    expect(client.join).toHaveBeenCalledTimes(1);
  });
});

/**
 * `session.observed` is emitted on the transitions only — one notice per
 * observer per window, never on the 20 s renewals. A viewer that was not
 * connected for the transition therefore never heard it: it reloaded, its socket
 * dropped for a moment, or the API restarted and took these process-local rooms
 * with it. Until the state was replayed on the join, the banner stayed wrong for
 * the rest of the observation — in both directions.
 */
describe('SessionsGateway — the notice a joining socket is owed', () => {
  let gateway: SessionsGateway;
  let jwt: { verifyAsync: ReturnType<typeof vi.fn> };
  let rbac: { effectivePermissions: ReturnType<typeof vi.fn> };
  let sessions: { observedState: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    jwt = { verifyAsync: vi.fn().mockResolvedValue(PAYLOAD) };
    rbac = { effectivePermissions: vi.fn().mockResolvedValue(new Set<string>()) };
    sessions = { observedState: vi.fn().mockResolvedValue(WATCHED) };
    gateway = new SessionsGateway(
      jwt as never,
      rbac as never,
      sessions as never,
      { JWT_ACCESS_SECRET: 'access-secret' } as never,
    );
    prismaMock.session.findFirst.mockResolvedValue({ userId: 'user1', kasmId: 'kid1' });
  });

  it('tells a reconnecting viewer that it is being watched right now', async () => {
    const client = socket({ auth: { token: 'good' }, query: { sessionId: 'sess1' } });
    await gateway.handleConnection(client as never);
    expect(sessions.observedState).toHaveBeenCalledWith({ id: 'sess1', orgId: 'org1', kasmId: 'kid1', userId: 'user1' });
    expect(client.emit).toHaveBeenCalledWith('event', { type: 'session.observed', payload: WATCHED });
  });

  it('takes down a banner left standing for an observation that ended', async () => {
    // The stop landed while this socket was away, so the retraction it carried
    // reached nobody.
    sessions.observedState.mockResolvedValue(NOBODY_WATCHING);
    const client = socket({ auth: { token: 'good' }, query: { sessionId: 'sess1' } });
    await gateway.handleConnection(client as never);
    expect(client.emit).toHaveBeenCalledWith('event', { type: 'session.observed', payload: NOBODY_WATCHING });
  });

  it('replays nothing to a socket kept out of the session room', async () => {
    prismaMock.session.findFirst.mockResolvedValue({ userId: 'someone-else', kasmId: 'kid1' });
    const client = socket({ auth: { token: 'good' }, query: { sessionId: 'sess1' } });
    await gateway.handleConnection(client as never);
    expect(sessions.observedState).not.toHaveBeenCalled();
    expect(client.emit).not.toHaveBeenCalled();
  });

  it('replays nothing to a socket that asked for no session', async () => {
    const client = socket({ auth: { token: 'good' } });
    await gateway.handleConnection(client as never);
    expect(client.emit).not.toHaveBeenCalled();
  });
});
