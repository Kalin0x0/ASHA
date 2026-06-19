import 'reflect-metadata';
import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    connectionProxyConfig: {
      findMany: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
      findFirst: vi.fn(),
    },
    egressGateway: {
      findMany: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
      findFirst: vi.fn(),
    },
    webFilterConfig: {
      findMany: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
      findFirst: vi.fn(),
    },
    browserIsolationConfig: {
      findMany: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));

vi.mock('@asha/db', () => ({ prisma: prismaMock }));

import { ConnectivityService } from './connectivity.service';

const audit = { record: vi.fn().mockResolvedValue(undefined) };

describe('ConnectivityService', () => {
  let svc: ConnectivityService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new ConnectivityService(audit as never);
  });

  // ── Connection proxies ─────────────────────────────────────────────────

  describe('proxies', () => {
    it('listProxies scopes to orgId', async () => {
      prismaMock.connectionProxyConfig.findMany.mockResolvedValue([]);
      await svc.listProxies('org1');
      expect(prismaMock.connectionProxyConfig.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ orgId: 'org1' }) }),
      );
    });

    it('createProxy records audit', async () => {
      const proxy = { id: 'p1', orgId: 'org1', name: 'P', type: 'GUACAMOLE', host: 'h', port: 4822, config: {}, enabled: true };
      prismaMock.connectionProxyConfig.create.mockResolvedValue(proxy);
      await svc.createProxy('org1', 'u1', { name: 'P', type: 'GUACAMOLE' as never, host: 'h', port: 4822, config: {}, enabled: true });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'proxy.create', targetType: 'ConnectionProxyConfig' }),
      );
    });

    it('updateProxy throws NotFoundException when not found', async () => {
      prismaMock.connectionProxyConfig.updateMany.mockResolvedValue({ count: 0 });
      await expect(svc.updateProxy('org1', 'u1', 'missing', { enabled: false })).rejects.toThrow(NotFoundException);
    });

    it('removeProxy throws NotFoundException when not found', async () => {
      prismaMock.connectionProxyConfig.deleteMany.mockResolvedValue({ count: 0 });
      await expect(svc.removeProxy('org1', 'u1', 'missing')).rejects.toThrow(NotFoundException);
    });
  });

  // ── Egress gateways ────────────────────────────────────────────────────

  describe('egress', () => {
    it('listEgress scopes to orgId', async () => {
      prismaMock.egressGateway.findMany.mockResolvedValue([]);
      await svc.listEgress('org1');
      expect(prismaMock.egressGateway.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ orgId: 'org1' }) }),
      );
    });

    it('createEgress records audit with provider metadata', async () => {
      prismaMock.egressGateway.create.mockResolvedValue({ id: 'e1' });
      await svc.createEgress('org1', 'u1', { name: 'G', provider: 'WIREGUARD' as never, config: {}, enabled: true });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'egress.create', metadata: { provider: 'WIREGUARD' } }),
      );
    });

    it('updateEgress throws NotFoundException when not found', async () => {
      prismaMock.egressGateway.updateMany.mockResolvedValue({ count: 0 });
      await expect(svc.updateEgress('org1', 'u1', 'missing', { enabled: false })).rejects.toThrow(NotFoundException);
    });

    it('removeEgress throws NotFoundException when not found', async () => {
      prismaMock.egressGateway.deleteMany.mockResolvedValue({ count: 0 });
      await expect(svc.removeEgress('org1', 'u1', 'missing')).rejects.toThrow(NotFoundException);
    });
  });

  // ── Web filters ────────────────────────────────────────────────────────

  describe('filters', () => {
    it('listFilters scopes to orgId', async () => {
      prismaMock.webFilterConfig.findMany.mockResolvedValue([]);
      await svc.listFilters('org1');
      expect(prismaMock.webFilterConfig.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ orgId: 'org1' }) }),
      );
    });

    it('createFilter records audit', async () => {
      prismaMock.webFilterConfig.create.mockResolvedValue({ id: 'f1' });
      await svc.createFilter('org1', 'u1', { name: 'F', categories: { adult: true }, cacheTtl: 300, enabled: true });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'webfilter.create', targetType: 'WebFilterConfig' }),
      );
    });

    it('updateFilter throws NotFoundException when not found', async () => {
      prismaMock.webFilterConfig.updateMany.mockResolvedValue({ count: 0 });
      await expect(svc.updateFilter('org1', 'u1', 'missing', { enabled: false })).rejects.toThrow(NotFoundException);
    });

    it('removeFilter throws NotFoundException when not found', async () => {
      prismaMock.webFilterConfig.deleteMany.mockResolvedValue({ count: 0 });
      await expect(svc.removeFilter('org1', 'u1', 'missing')).rejects.toThrow(NotFoundException);
    });
  });

  // ── Browser isolation ──────────────────────────────────────────────────

  describe('isolation', () => {
    it('listIsolation scopes to orgId', async () => {
      prismaMock.browserIsolationConfig.findMany.mockResolvedValue([]);
      await svc.listIsolation('org1');
      expect(prismaMock.browserIsolationConfig.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ orgId: 'org1' }) }),
      );
    });

    it('createIsolation records audit', async () => {
      prismaMock.browserIsolationConfig.create.mockResolvedValue({ id: 'i1' });
      await svc.createIsolation('org1', 'u1', { name: 'I', forwardProxy: 'http://proxy', config: {}, enabled: true });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'isolation.create', targetType: 'BrowserIsolationConfig' }),
      );
    });

    it('updateIsolation throws NotFoundException when not found', async () => {
      prismaMock.browserIsolationConfig.updateMany.mockResolvedValue({ count: 0 });
      await expect(svc.updateIsolation('org1', 'u1', 'missing', { enabled: false })).rejects.toThrow(NotFoundException);
    });

    it('removeIsolation throws NotFoundException when not found', async () => {
      prismaMock.browserIsolationConfig.deleteMany.mockResolvedValue({ count: 0 });
      await expect(svc.removeIsolation('org1', 'u1', 'missing')).rejects.toThrow(NotFoundException);
    });
  });
});
