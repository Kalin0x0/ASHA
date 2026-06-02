import 'reflect-metadata';
import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    bannerWatermarkConfig: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock('@chista/db', () => ({ prisma: prismaMock }));

import { WatermarksService } from './watermarks.service';

const audit = { record: vi.fn().mockResolvedValue(undefined) };

describe('WatermarksService', () => {
  let svc: WatermarksService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new WatermarksService(audit as never);
  });

  it('creates a new config when none exists for the target', async () => {
    prismaMock.bannerWatermarkConfig.findFirst.mockResolvedValue(null);
    prismaMock.bannerWatermarkConfig.create.mockResolvedValue({ id: 'w1' });
    await svc.upsert('org1', 'u1', { scope: 'WORKSPACE', refId: 'ws1', watermarkOpacity: 0.2 });
    expect(prismaMock.bannerWatermarkConfig.create).toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'watermark.create' }));
  });

  it('updates in place when a config already exists for the target', async () => {
    prismaMock.bannerWatermarkConfig.findFirst.mockResolvedValue({ id: 'w1' });
    prismaMock.bannerWatermarkConfig.update.mockResolvedValue({ id: 'w1' });
    await svc.upsert('org1', 'u1', { scope: 'WORKSPACE', refId: 'ws1', watermarkOpacity: 0.3 });
    expect(prismaMock.bannerWatermarkConfig.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'w1' } }),
    );
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'watermark.update' }));
  });

  it('remove throws NotFoundException when nothing matched', async () => {
    prismaMock.bannerWatermarkConfig.deleteMany.mockResolvedValue({ count: 0 });
    await expect(svc.remove('org1', 'u1', 'missing')).rejects.toThrow(NotFoundException);
  });

  it('resolves WORKSPACE scope ahead of GROUP and USER, expanding tokens', async () => {
    prismaMock.bannerWatermarkConfig.findMany.mockResolvedValue([
      { scope: 'USER', refId: 'u1', watermarkText: 'user-level', watermarkOpacity: 0.1, bannerText: null, bannerColor: null },
      { scope: 'WORKSPACE', refId: 'ws1', watermarkText: '{{user}} • {{date}}', watermarkOpacity: 0.2, bannerText: 'SECRET', bannerColor: '#ff0000' },
    ]);
    const res = await svc.resolveForSession('org1', { userId: 'u1', groupIds: [], workspaceId: 'ws1' });
    expect(res?.bannerText).toBe('SECRET');
    expect(res?.watermarkText).toContain('u1');
    expect(res?.watermarkText).not.toContain('{{user}}');
  });

  it('returns null when no config matches the session context', async () => {
    prismaMock.bannerWatermarkConfig.findMany.mockResolvedValue([
      { scope: 'WORKSPACE', refId: 'other-ws', watermarkText: 'x', watermarkOpacity: 0.1 },
    ]);
    const res = await svc.resolveForSession('org1', { userId: 'u1', groupIds: ['g1'], workspaceId: 'ws1' });
    expect(res).toBeNull();
  });
});
