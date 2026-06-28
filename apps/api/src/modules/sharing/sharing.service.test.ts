import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    session: { findUnique: vi.fn() },
    sessionShare: { upsert: vi.fn(), findUnique: vi.fn(), deleteMany: vi.fn() },
    shareParticipant: { create: vi.fn(), updateMany: vi.fn() },
    shareChatMessage: { create: vi.fn(), findMany: vi.fn() },
  },
}));

vi.mock('@asha/db', () => ({ prisma: prismaMock }));

import { SharingService } from './sharing.service';

const USER = { sub: 'user1', orgId: 'org1', email: 'a@b.c' } as never;

describe('SharingService.create', () => {
  let svc: SharingService;
  let gateway: { emitToSession: ReturnType<typeof vi.fn> };
  let audit: { record: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    gateway = { emitToSession: vi.fn() };
    audit = { record: vi.fn().mockResolvedValue(undefined) };
    svc = new SharingService(gateway as never, audit as never);
  });

  it('creates a share for a running session owned by the caller', async () => {
    prismaMock.session.findUnique.mockResolvedValue({ id: 'sess1', orgId: 'org1', userId: 'user1', status: 'RUNNING' });
    prismaMock.sessionShare.upsert.mockResolvedValue({ id: 'share1', sessionId: 'sess1' });

    const res = await svc.create(USER, 'sess1', {
      allowControl: false,
      requireAuth: true,
      enableChat: true,
      enableAv: false,
    });

    expect(res).toEqual({ id: 'share1', sessionId: 'sess1' });
    expect(audit.record).toHaveBeenCalled();
  });

  it('rejects sharing a session the caller does not own', async () => {
    prismaMock.session.findUnique.mockResolvedValue({ id: 'sess1', orgId: 'org1', userId: 'other', status: 'RUNNING' });
    await expect(
      svc.create(USER, 'sess1', { allowControl: false, requireAuth: true, enableChat: true, enableAv: false }),
    ).rejects.toThrow('owner');
  });

  it('rejects sharing a session that is not running', async () => {
    prismaMock.session.findUnique.mockResolvedValue({ id: 'sess1', orgId: 'org1', userId: 'user1', status: 'PROVISIONING' });
    await expect(
      svc.create(USER, 'sess1', { allowControl: false, requireAuth: true, enableChat: true, enableAv: false }),
    ).rejects.toThrow('running');
  });

  it('throws when the session does not exist', async () => {
    prismaMock.session.findUnique.mockResolvedValue(null);
    await expect(
      svc.create(USER, 'ghost', { allowControl: false, requireAuth: true, enableChat: true, enableAv: false }),
    ).rejects.toThrow();
  });

  it('treats another org\'s session as not found (no cross-tenant leak)', async () => {
    prismaMock.session.findUnique.mockResolvedValue({ id: 'sess1', orgId: 'org2', userId: 'user1', status: 'RUNNING' });
    await expect(
      svc.create(USER, 'sess1', { allowControl: false, requireAuth: true, enableChat: true, enableAv: false }),
    ).rejects.toThrow('not found');
  });
});

describe('SharingService.join + chat', () => {
  let svc: SharingService;
  let gateway: { emitToSession: ReturnType<typeof vi.fn> };
  let audit: { record: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    gateway = { emitToSession: vi.fn() };
    audit = { record: vi.fn().mockResolvedValue(undefined) };
    svc = new SharingService(gateway as never, audit as never);
  });

  it('lets a guest join an active share and emits a participant event', async () => {
    prismaMock.sessionShare.findUnique.mockResolvedValue({
      id: 'share1',
      sessionId: 'sess1',
      allowControl: true,
      enableChat: true,
      expiresAt: null,
    });
    prismaMock.shareParticipant.create.mockResolvedValue({ id: 'p1' });

    const res = await svc.join('key1', { guestName: 'Bob' });

    expect(res).toEqual({ participantId: 'p1', sessionId: 'sess1', allowControl: true });
    expect(gateway.emitToSession).toHaveBeenCalledWith(
      'sess1',
      expect.objectContaining({ type: 'share.participant', payload: expect.objectContaining({ joined: true }) }),
    );
  });

  it('rejects joining an expired share', async () => {
    prismaMock.sessionShare.findUnique.mockResolvedValue({
      id: 'share1',
      sessionId: 'sess1',
      expiresAt: new Date(Date.now() - 1000),
    });
    await expect(svc.join('key1', {})).rejects.toThrow('expired');
  });

  it('posts a chat message and fans it out over the gateway', async () => {
    prismaMock.sessionShare.findUnique.mockResolvedValue({
      id: 'share1',
      sessionId: 'sess1',
      enableChat: true,
      expiresAt: null,
    });
    prismaMock.shareChatMessage.create.mockResolvedValue({
      id: 'm1',
      body: 'hi',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });

    await svc.postMessage('key1', { body: 'hi' }, { id: 'user1', name: 'Alice' });

    expect(gateway.emitToSession).toHaveBeenCalledWith(
      'sess1',
      expect.objectContaining({
        type: 'share.chat',
        payload: expect.objectContaining({ body: 'hi', authorName: 'Alice' }),
      }),
    );
  });

  it('rejects chat when chat is disabled for the share', async () => {
    prismaMock.sessionShare.findUnique.mockResolvedValue({
      id: 'share1',
      sessionId: 'sess1',
      enableChat: false,
      expiresAt: null,
    });
    await expect(svc.postMessage('key1', { body: 'hi' })).rejects.toThrow('disabled');
  });

  // ── requireAuth enforcement ─────────────────────────────────────────────────

  it('rejects an anonymous guest joining a requireAuth share', async () => {
    prismaMock.sessionShare.findUnique.mockResolvedValue({
      id: 'share1', sessionId: 'sess1', allowControl: false, enableChat: true, requireAuth: true, expiresAt: null,
    });
    await expect(svc.join('key1', { guestName: 'Bob' })).rejects.toThrow(/sign in/i);
    expect(prismaMock.shareParticipant.create).not.toHaveBeenCalled();
  });

  it('lets a signed-in user join a requireAuth share', async () => {
    prismaMock.sessionShare.findUnique.mockResolvedValue({
      id: 'share1', sessionId: 'sess1', allowControl: false, enableChat: true, requireAuth: true, expiresAt: null,
    });
    prismaMock.shareParticipant.create.mockResolvedValue({ id: 'p1' });
    const res = await svc.join('key1', { guestName: 'Bob' }, 'user1');
    expect(res.participantId).toBe('p1');
  });

  it('rejects an anonymous chat post on a requireAuth share', async () => {
    prismaMock.sessionShare.findUnique.mockResolvedValue({
      id: 'share1', sessionId: 'sess1', enableChat: true, requireAuth: true, expiresAt: null,
    });
    await expect(svc.postMessage('key1', { body: 'hi' })).rejects.toThrow(/sign in/i);
    expect(prismaMock.shareChatMessage.create).not.toHaveBeenCalled();
  });
});
