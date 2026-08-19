import 'reflect-metadata';
import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    agent: { findUnique: vi.fn(), update: vi.fn(), upsert: vi.fn() },
    session: {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      count: vi.fn().mockResolvedValue(0),
    },
  },
}));

vi.mock('@asha/db', () => ({
  prisma: prismaMock,
  runUnscoped: <T>(fn: () => T) => fn(),
}));

import { AgentsService } from './agents.service';

/**
 * An agent token proves "some agent", not "which agent". These routes take the
 * agent/session id straight from the URL, so a minted org token MUST NOT be
 * able to reach another tenant's rows. Without the scope check every one of
 * these cases silently succeeds — which is a cross-tenant session hijack
 * (redirect a live RDP/VNC stream) or a one-request remote kill.
 */
describe('AgentsService — agent-token org scoping', () => {
  let svc: AgentsService;
  const gateway = { emitToOrg: vi.fn() };

  const ORG_A_SESSION = { id: 's1', orgId: 'org-a', kasmId: 'k1', status: 'RUNNING', connectionType: 'KASMVNC' };
  const FOREIGN_TOKEN = { scope: 'org' as const, orgId: 'org-b', zoneId: null };
  const OWN_TOKEN = { scope: 'org' as const, orgId: 'org-a', zoneId: null };
  const GLOBAL_TOKEN = { scope: 'global' as const };

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.session.count.mockResolvedValue(0);
    prismaMock.session.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.session.update.mockResolvedValue({});
    svc = new AgentsService(
      gateway as never,
      { signAsync: vi.fn() } as never,
      { publish: vi.fn(), set: vi.fn(), del: vi.fn() } as never,
      {} as never,
    );
  });

  describe('updateSessionStatus', () => {
    it('refuses a token from another org — and does not touch the session', async () => {
      prismaMock.session.findUnique.mockResolvedValue(ORG_A_SESSION);

      await expect(
        svc.updateSessionStatus('s1', { status: 'ERROR' } as never, FOREIGN_TOKEN),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(prismaMock.session.update).not.toHaveBeenCalled();
    });

    it('rejects with NotFound (not Forbidden) so it cannot be used as an id oracle', async () => {
      prismaMock.session.findUnique.mockResolvedValue(ORG_A_SESSION);

      const foreign = await svc
        .updateSessionStatus('s1', { status: 'ERROR' } as never, FOREIGN_TOKEN)
        .catch((e: Error) => e);
      prismaMock.session.findUnique.mockResolvedValue(null);
      const missing = await svc
        .updateSessionStatus('nope', { status: 'ERROR' } as never, FOREIGN_TOKEN)
        .catch((e: Error) => e);

      // A foreign session and a non-existent one must be indistinguishable.
      expect((foreign as NotFoundException).getStatus()).toBe((missing as NotFoundException).getStatus());
    });

    it('allows the session\'s own org', async () => {
      prismaMock.session.findUnique.mockResolvedValue(ORG_A_SESSION);
      await expect(svc.updateSessionStatus('s1', { status: 'ERROR' } as never, OWN_TOKEN)).resolves.toBeDefined();
    });

    it('allows a global (shared env) token — the deployment super-admin', async () => {
      prismaMock.session.findUnique.mockResolvedValue(ORG_A_SESSION);
      await expect(svc.updateSessionStatus('s1', { status: 'ERROR' } as never, GLOBAL_TOKEN)).resolves.toBeDefined();
    });
  });

  describe('heartbeat', () => {
    it('refuses to drive an agent belonging to another org', async () => {
      prismaMock.agent.findUnique.mockResolvedValue({ orgId: 'org-a' });

      await expect(svc.heartbeat('agent-1', { memFreeMb: 1, loadPercent: 1 } as never, FOREIGN_TOKEN)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prismaMock.agent.update).not.toHaveBeenCalled();
    });

    it('allows the agent\'s own org', async () => {
      prismaMock.agent.findUnique.mockResolvedValue({ orgId: 'org-a', drainRequested: false });
      await expect(svc.heartbeat('agent-1', { memFreeMb: 1, loadPercent: 1 } as never, OWN_TOKEN)).resolves.toEqual({ ok: true });
      expect(prismaMock.agent.update).toHaveBeenCalled();
    });
  });

  describe('ingestStats', () => {
    it('drops samples for another org without writing or emitting', async () => {
      prismaMock.session.findUnique.mockResolvedValue({ orgId: 'org-a' });

      await svc.ingestStats({ samples: [{ sessionId: 's1', cpuPct: 99, memMb: 99 }] } as never, FOREIGN_TOKEN);

      expect(prismaMock.session.updateMany).not.toHaveBeenCalled();
      // Injecting into another tenant's live WebSocket feed is the other half
      // of this hole — assert the emit is gated too, not just the DB write.
      expect(gateway.emitToOrg).not.toHaveBeenCalled();
    });

    it('accepts samples for its own org', async () => {
      prismaMock.session.findUnique.mockResolvedValue({ orgId: 'org-a' });

      await svc.ingestStats({ samples: [{ sessionId: 's1', cpuPct: 10, memMb: 20 }] } as never, OWN_TOKEN);

      expect(prismaMock.session.updateMany).toHaveBeenCalled();
      expect(gateway.emitToOrg).toHaveBeenCalledWith('org-a', expect.objectContaining({ type: 'session.stats' }));
    });
  });
});
