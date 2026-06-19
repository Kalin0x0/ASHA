import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    server: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), findMany: vi.fn() },
    deploymentZone: { findFirst: vi.fn() },
  },
}));
vi.mock('@asha/db', () => ({ prisma: prismaMock }));

import { ServerAgentService } from './server-agent.service';

const tokens = { validate: vi.fn(), markUsed: vi.fn().mockResolvedValue(undefined) };
const env = {
  ASHA_WG_ENDPOINT: 'tunnel.example.com:51820',
  ASHA_WG_SERVER_PUBLIC_KEY: 'SERVERPUBKEY=',
  ASHA_WG_SUBNET: '10.77.0.0/24',
  ASHA_WG_ALLOWED_IPS: '10.77.0.0/24',
};

describe('ServerAgentService', () => {
  let svc: ServerAgentService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new ServerAgentService(tokens as never, env as never);
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

  it('issues a WireGuard tunnel config, assigning the first free /24 IP', async () => {
    prismaMock.server.findFirst.mockResolvedValue({ id: 'srv1', tunnelIp: null });
    prismaMock.server.findMany.mockResolvedValue([{ tunnelIp: '10.77.0.2' }]); // .2 used → expect .3
    prismaMock.server.update.mockResolvedValue({ id: 'srv1' });

    const res = await svc.requestTunnel('cra_tok', 'WIN-1');

    expect(res.tunnelIp).toBe('10.77.0.3');
    expect(res.config).toContain('[Interface]');
    expect(res.config).toContain('Address = 10.77.0.3/32');
    expect(res.config).toContain('Endpoint = tunnel.example.com:51820');
    expect(res.config).toContain('PublicKey = SERVERPUBKEY=');
    // the host address is repointed at the tunnel IP
    expect(prismaMock.server.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ address: '10.77.0.3', tunnelIp: '10.77.0.3' }) }),
    );
  });

  it('refuses a tunnel when WireGuard is not configured', async () => {
    const svc2 = new ServerAgentService(tokens as never, { ASHA_WG_ENDPOINT: '', ASHA_WG_SERVER_PUBLIC_KEY: '' } as never);
    await expect(svc2.requestTunnel('cra_tok', 'WIN-1')).rejects.toThrow(/not configured/i);
  });

  it('renders the WG server-side peer list', async () => {
    prismaMock.server.findMany.mockResolvedValue([
      { hostname: 'WIN-1', tunnelIp: '10.77.0.2', tunnelPublicKey: 'PUBKEY1=' },
    ]);
    const res = await svc.wgPeers('org1');
    expect(res.count).toBe(1);
    expect(res.content).toContain('[Peer]');
    expect(res.content).toContain('PublicKey = PUBKEY1=');
    expect(res.content).toContain('AllowedIPs = 10.77.0.2/32');
  });
});
