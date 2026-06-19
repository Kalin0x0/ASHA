import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    server: { findMany: vi.fn(), create: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn(), findFirst: vi.fn() },
    deploymentZone: { findFirst: vi.fn() },
  },
}));

vi.mock('@asha/db', () => ({ prisma: prismaMock }));

import { ServersService } from './servers.service';

const audit = { record: vi.fn().mockResolvedValue(undefined) };
const jwt = { signAsync: vi.fn().mockResolvedValue('token') };
const redis = { set: vi.fn().mockResolvedValue(undefined) };
const env = {
  SECRET_SEAL_KEY: '0123456789abcdef0123456789abcdef',
  SESSION_TOKEN_SECRET: 'session-secret',
  SESSION_TOKEN_TTL: 120,
  ASHA_PUBLIC_URL: 'https://asha.test',
};

describe('ServersService', () => {
  let svc: ServersService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new ServersService(audit as never, jwt as never, redis as never, env as never);
  });

  it('refuses to create a server in a zone from another org', async () => {
    prismaMock.deploymentZone.findFirst.mockResolvedValue(null);
    await expect(
      svc.create('org1', 'u1', {
        zoneId: 'foreignZone',
        hostname: 'srv1',
        address: '10.0.0.1',
        connectionType: 'RDP',
        authMode: 'PASSWORD',
        continuity: 'NONE',
        maxSessions: 1,
      }),
    ).rejects.toThrow('Zone not found');
    expect(prismaMock.server.create).not.toHaveBeenCalled();
  });

  it('creates a server when the zone is valid', async () => {
    prismaMock.deploymentZone.findFirst.mockResolvedValue({ id: 'z1', orgId: 'org1' });
    prismaMock.server.create.mockResolvedValue({ id: 'srv1' });
    await svc.create('org1', 'u1', {
      zoneId: 'z1',
      hostname: 'srv1',
      address: '10.0.0.1',
      connectionType: 'SSH',
      authMode: 'KEY',
      continuity: 'TMUX',
      maxSessions: 4,
    });
    expect(prismaMock.server.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ orgId: 'org1', zoneId: 'z1' }) }),
    );
  });

  it('throws 404 updating a server in another org', async () => {
    prismaMock.server.updateMany.mockResolvedValue({ count: 0 });
    await expect(svc.update('org1', 'u1', 'foreign', { maxSessions: 2 })).rejects.toThrow('not found');
  });

  it('generates a .rdp file for an RDP server (multimon/clipboard/drives, no password)', async () => {
    prismaMock.server.findFirst.mockResolvedValue({
      id: 'srv1',
      orgId: 'org1',
      hostname: 'win11 desktop',
      address: '10.0.0.9',
      connectionType: 'RDP',
      credentialRef: null,
    });
    const { filename, content } = await svc.rdpFile('org1', 'u1', 'srv1', {});
    expect(filename).toBe('win11-desktop.rdp');
    expect(content).toContain('full address:s:10.0.0.9:3389');
    expect(content).toContain('use multimon:i:1');
    expect(content).toContain('redirectclipboard:i:1');
    expect(content).toContain('drivestoredirect:s:*');
    expect(content).not.toMatch(/password/i);
  });

  it('refuses a .rdp file for a non-RDP server', async () => {
    prismaMock.server.findFirst.mockResolvedValue({ id: 's', orgId: 'org1', connectionType: 'SSH' });
    await expect(svc.rdpFile('org1', 'u1', 's', {})).rejects.toThrow(/only available for RDP/i);
  });

  it('404s a .rdp file for a server in another org', async () => {
    prismaMock.server.findFirst.mockResolvedValue(null);
    await expect(svc.rdpFile('org1', 'u1', 'foreign', {})).rejects.toThrow('not found');
  });
});
