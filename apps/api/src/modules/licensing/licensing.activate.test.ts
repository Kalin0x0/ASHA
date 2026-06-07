import 'reflect-metadata';
import { generateKeyPairSync, sign as edSign } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: { license: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() } },
}));
vi.mock('@chista/db', () => ({ prisma: prismaMock }));

import { LicensingService } from './licensing.service';

const audit = { record: vi.fn().mockResolvedValue(undefined) };
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const ORG = 'org1';

function makeKey(claims: Record<string, unknown>): string {
  const payloadB64 = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const sig = edSign(null, Buffer.from(payloadB64), privateKey).toString('base64url');
  return `${payloadB64}.${sig}`;
}

beforeAll(() => {
  process.env.CHISTA_LICENSE_PUBKEY = publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
});

describe('LicensingService.activate — Ed25519 offline license', () => {
  let svc: LicensingService;
  beforeEach(() => {
    vi.clearAllMocks();
    svc = new LicensingService(audit as never);
    prismaMock.license.findFirst.mockResolvedValue(null);
    prismaMock.license.create.mockResolvedValue({ id: 'lic1' });
  });

  it('activates a validly-signed license and stores the claims', async () => {
    const key = makeKey({ type: 'CONCURRENT', seats: 25, concurrentSessions: 50, issuedTo: 'Persia' });
    const lic = await svc.activate(ORG, 'admin1', key);
    expect(prismaMock.license.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'CONCURRENT', seats: 25, concurrentSessions: 50 }),
      }),
    );
    expect(lic).toMatchObject({ id: 'lic1' });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'license.activate' }));
  });

  it('rejects a tampered payload (signature mismatch)', async () => {
    const key = makeKey({ type: 'CONCURRENT', seats: 5, concurrentSessions: 5 });
    const [p, s] = key.split('.');
    await expect(svc.activate(ORG, 'admin1', `${p}X.${s}`)).rejects.toThrow(BadRequestException);
    expect(prismaMock.license.create).not.toHaveBeenCalled();
  });

  it('rejects an expired license (notAfter in the past)', async () => {
    const key = makeKey({ type: 'CONCURRENT', seats: 5, concurrentSessions: 5, notAfter: '2020-01-01T00:00:00Z' });
    await expect(svc.activate(ORG, 'admin1', key)).rejects.toThrow(BadRequestException);
  });

  it('rejects a license bound to a different installation', async () => {
    const key = makeKey({ type: 'CONCURRENT', seats: 5, concurrentSessions: 5, installationId: 'wrong-install' });
    await expect(svc.activate(ORG, 'admin1', key)).rejects.toThrow(BadRequestException);
  });

  it('accepts a license bound to THIS installation', async () => {
    const key = makeKey({
      type: 'CONCURRENT',
      seats: 5,
      concurrentSessions: 5,
      installationId: svc.installationId(ORG),
    });
    await expect(svc.activate(ORG, 'admin1', key)).resolves.toMatchObject({ id: 'lic1' });
  });

  it('rejects a malformed key', async () => {
    await expect(svc.activate(ORG, 'admin1', 'not-a-valid-key')).rejects.toThrow(BadRequestException);
  });

  it('rejects signed-but-invalid claims (missing seats)', async () => {
    const key = makeKey({ type: 'CONCURRENT', concurrentSessions: 5 });
    await expect(svc.activate(ORG, 'admin1', key)).rejects.toThrow(BadRequestException);
    expect(prismaMock.license.create).not.toHaveBeenCalled();
  });
});
