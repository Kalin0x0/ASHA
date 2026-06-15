import { describe, expect, it } from 'vitest';
import {
  encryptGuacToken,
  hashPassword,
  hashToken,
  randomToken,
  safeEqual,
  seal,
  unseal,
  verifyPassword,
} from './index';

describe('passwords', () => {
  it('hashes and verifies a password', async () => {
    const hash = await hashPassword('s3cret-pw');
    expect(hash).not.toBe('s3cret-pw');
    expect(await verifyPassword('s3cret-pw', hash)).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('s3cret-pw');
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });
});

describe('tokens', () => {
  it('generates hex tokens of the requested byte length', () => {
    expect(randomToken(16)).toMatch(/^[0-9a-f]{32}$/);
    expect(randomToken()).toHaveLength(64);
  });

  it('generates unique tokens', () => {
    expect(randomToken()).not.toBe(randomToken());
  });

  it('hashToken is a deterministic sha256 hex digest', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'));
    expect(hashToken('abc')).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken('abc')).not.toBe(hashToken('abd'));
  });
});

describe('safeEqual', () => {
  it('is true for equal strings and false otherwise', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
  });

  it('is false for differing lengths', () => {
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('seal / unseal (AES-256-GCM)', () => {
  const secret = 'a-very-secret-sealing-key';

  it('round-trips plaintext', () => {
    const sealed = seal('provider-api-key', secret);
    expect(sealed).not.toContain('provider-api-key');
    expect(unseal(sealed, secret)).toBe('provider-api-key');
  });

  it('produces a different ciphertext each time (random IV)', () => {
    expect(seal('same', secret)).not.toBe(seal('same', secret));
  });

  it('throws when unsealed with the wrong secret', () => {
    const sealed = seal('data', secret);
    expect(() => unseal(sealed, 'wrong-secret')).toThrow();
  });

  it('throws on a tampered token', () => {
    const sealed = seal('data', secret);
    const [iv, tag, enc] = sealed.split('.');
    const tampered = [iv, tag, Buffer.from('zzzz').toString('base64')].join('.');
    expect(() => unseal(tampered, secret)).toThrow();
  });

  it('throws on a malformed token', () => {
    expect(() => unseal('not-a-valid-token', secret)).toThrow('Malformed sealed token');
  });
});

describe('encryptGuacToken (AES-256-CBC)', () => {
  it('produces a base64 envelope with iv and value', () => {
    const token = encryptGuacToken({ connection: { type: 'rdp' } }, 'MySuperSecretKeyForParamsToken12');
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf8'));
    expect(typeof decoded.iv).toBe('string');
    expect(typeof decoded.value).toBe('string');
    // IV is 16 random bytes → 24 base64 chars (with padding).
    expect(Buffer.from(decoded.iv, 'base64')).toHaveLength(16);
  });
});
