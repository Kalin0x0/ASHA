import 'reflect-metadata';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    experimentalFeature: { findUnique: vi.fn() },
    orgFeatureFlag: { upsert: vi.fn() },
  },
}));
vi.mock('@asha/db', () => ({ prisma: prismaMock }));

import { ExperimentalFeaturesService } from './experimental-features.service';

const audit = { record: vi.fn().mockResolvedValue(undefined) };
const svc = new ExperimentalFeaturesService(audit as never);

describe('ExperimentalFeaturesService (H4)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('isEnabled honours the org flag override', async () => {
    prismaMock.experimentalFeature.findUnique.mockResolvedValue({ id: 'f', enabledByDefault: false, flags: [{ enabled: true }] });
    expect(await svc.isEnabled('org1', 'x')).toBe(true);
  });

  it('isEnabled falls back to the catalog default', async () => {
    prismaMock.experimentalFeature.findUnique.mockResolvedValue({ id: 'f', enabledByDefault: true, flags: [] });
    expect(await svc.isEnabled('org1', 'x')).toBe(true);
  });

  it('isEnabled is false for an unknown feature', async () => {
    prismaMock.experimentalFeature.findUnique.mockResolvedValue(null);
    expect(await svc.isEnabled('org1', 'nope')).toBe(false);
  });

  it('setFlag refuses to enable without acceptedRisk', async () => {
    prismaMock.experimentalFeature.findUnique.mockResolvedValue({ id: 'f' });
    await expect(svc.setFlag('org1', 'u', 'x', true, false)).rejects.toThrow(BadRequestException);
  });

  it('setFlag rejects an unknown feature', async () => {
    prismaMock.experimentalFeature.findUnique.mockResolvedValue(null);
    await expect(svc.setFlag('org1', 'u', 'nope', true, true)).rejects.toThrow(NotFoundException);
  });

  it('setFlag enables with acceptedRisk and audits it', async () => {
    prismaMock.experimentalFeature.findUnique.mockResolvedValue({ id: 'f' });
    prismaMock.orgFeatureFlag.upsert.mockResolvedValue({ id: 'flag', enabled: true });
    await svc.setFlag('org1', 'u', 'x', true, true);
    expect(prismaMock.orgFeatureFlag.upsert).toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'feature.enable' }));
  });
});
