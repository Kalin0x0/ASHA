import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({ prismaMock: { branding: { findFirst: vi.fn() } } }));
vi.mock('@asha/db', () => ({ prisma: prismaMock }));

import { SettingsService } from './settings.service';

const audit = { record: vi.fn().mockResolvedValue(undefined) };
const svc = new SettingsService(audit as never);

describe('SettingsService.resolveBranding — G3 hierarchy', () => {
  beforeEach(() => vi.clearAllMocks());

  it('group branding wins over org', async () => {
    prismaMock.branding.findFirst.mockImplementation((args: { where: { scope: string } }) =>
      args.where.scope === 'GROUP'
        ? Promise.resolve({ id: 'g', productName: 'Group Co', primaryColor: '#111111' })
        : Promise.resolve({ id: 'o', productName: 'Org Co', primaryColor: '#222222' }),
    );
    expect(await svc.resolveBranding('org1', 'grp1')).toMatchObject({ productName: 'Group Co', resolvedFrom: 'GROUP' });
  });

  it('falls back to org when the group has no branding', async () => {
    prismaMock.branding.findFirst.mockImplementation((args: { where: { scope: string } }) =>
      args.where.scope === 'GROUP' ? Promise.resolve(null) : Promise.resolve({ id: 'o', productName: 'Org Co' }),
    );
    expect(await svc.resolveBranding('org1', 'grp1')).toMatchObject({ productName: 'Org Co', resolvedFrom: 'ORG' });
  });

  it('falls back to the built-in default when nothing is set', async () => {
    prismaMock.branding.findFirst.mockResolvedValue(null);
    expect(await svc.resolveBranding('org1')).toMatchObject({
      productName: 'Asha',
      resolvedFrom: 'DEFAULT',
      primaryColor: '#1a1a2e',
    });
  });
});
