import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    server: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    deploymentZone: { findFirst: vi.fn() },
  },
}));
vi.mock('@chista/db', () => ({ prisma: prismaMock }));

import { ServerAgentService } from './server-agent.service';

const tokens = { validate: vi.fn(), markUsed: vi.fn().mockResolvedValue(undefined) };

describe('ServerAgentService', () => {
  let svc: ServerAgentService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new ServerAgentService(tokens as never);
    tokens.validate.mockResolvedValue({ orgId: 'org1', zoneId: null, tokenId: 'tok1' });
  });

  it('auto-registers a new host as an ONLINE server in the default zone', async () => {
    prismaMock.deploymentZone.findFirst.mockResolvedValueOnce({ id: 'z1', orgId: 'org1' }); // default zone
    prismaMock.server.findFirst.mockResolvedValue(null);
    prismaMock.server.create.mockResolvedValue({ id: 'srv1', status: 'ONLINE' });

    const res = await svc.register('cra_tok', { hostname: 'WIN-1', address: '10.0.0.5', connectionType: 'RDP' });

    expect(res).toMatchObject({ serverId: 'srv1', zoneId: 'z1', status: 'ONLINE' });
    expect(prismaMock.server.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ orgId: 'org1', hostname: 'WIN-1', status: 'ONLINE' }),
      }),
    );
    expect(tokens.markUsed).toHaveBeenCalledWith('tok1');
  });

  it('refreshes an existing server on re-register (no duplicate)', async () => {
    prismaMock.deploymentZone.findFirst.mockResolvedValueOnce({ id: 'z1', orgId: 'org1' });
    prismaMock.server.findFirst.mockResolvedValue({ id: 'srv1' });
    prismaMock.server.update.mockResolvedValue({ id: 'srv1', status: 'ONLINE' });

    await svc.register('cra_tok', { hostname: 'WIN-1', address: '10.0.0.5', connectionType: 'RDP' });

    expect(prismaMock.server.update).toHaveBeenCalled();
    expect(prismaMock.server.create).not.toHaveBeenCalled();
  });

  it('heartbeat marks the matching server ONLINE', async () => {
    prismaMock.server.updateMany.mockResolvedValue({ count: 1 });
    expect(await svc.heartbeat('cra_tok', { hostname: 'WIN-1' })).toEqual({ ok: true });
    expect(prismaMock.server.updateMany).toHaveBeenCalledWith({
      where: { orgId: 'org1', hostname: 'WIN-1' },
      data: expect.objectContaining({ status: 'ONLINE' }),
    });
  });

  it('heartbeat 401s when the host is not registered', async () => {
    prismaMock.server.updateMany.mockResolvedValue({ count: 0 });
    await expect(svc.heartbeat('cra_tok', { hostname: 'GHOST' })).rejects.toThrow(/not registered/i);
  });
});
