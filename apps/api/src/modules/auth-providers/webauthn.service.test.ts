import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    user: { findUnique: vi.fn(), findFirst: vi.fn() },
    userCredential: { findMany: vi.fn(), create: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
  },
}));

vi.mock('@chista/db', () => ({ prisma: prismaMock }));

import { WebauthnService } from './webauthn.service';

const env = { CHISTA_PUBLIC_URL: 'https://chista.example.com' } as never;

describe('WebauthnService', () => {
  let service: WebauthnService;

  beforeEach(() => {
    service = new WebauthnService(env);
    vi.clearAllMocks();
  });

  it('derives rpID + origin from CHISTA_PUBLIC_URL', () => {
    // @ts-expect-error access private for test
    const rp = service.rp();
    expect(rp.rpID).toBe('chista.example.com');
    expect(rp.origin).toBe('https://chista.example.com');
  });

  it('generates registration options and stores a challenge', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'a@example.com',
      username: 'a',
      displayName: 'A',
    });
    prismaMock.userCredential.findMany.mockResolvedValue([]);

    const options = await service.registrationOptions('u1');
    expect(options.challenge).toBeTruthy();
    expect(options.rp.id).toBe('chista.example.com');
  });

  it('rejects registration verify when no challenge is pending', async () => {
    await expect(
      service.verifyRegistration('u-nope', {} as never),
    ).rejects.toThrow(/challenge expired/i);
  });

  it('rejects authentication verify when no challenge is pending', async () => {
    await expect(
      service.verifyAuthentication('ghost@example.com', { id: 'x' } as never),
    ).rejects.toThrow(/challenge expired/i);
  });

  it('lists a user passkeys with friendly device names', async () => {
    prismaMock.userCredential.findMany.mockResolvedValue([
      { id: 'c1', metadata: { deviceName: 'Touch ID' }, createdAt: new Date() },
      { id: 'c2', metadata: {}, createdAt: new Date() },
    ]);
    const list = await service.listCredentials('u1');
    expect(list).toHaveLength(2);
    expect(list[0].deviceName).toBe('Touch ID');
    expect(list[1].deviceName).toBe('Passkey');
  });

  it('authentication options always returns a challenge (no account enumeration)', async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);
    const options = await service.authenticationOptions('unknown@example.com');
    expect(options.challenge).toBeTruthy();
    expect(options.allowCredentials ?? []).toHaveLength(0);
  });
});
