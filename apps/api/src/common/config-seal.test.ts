import { describe, expect, it } from 'vitest';
import { isSecretKey, mergeSealedConfig, redactConfig, sealConfig, unsealConfig } from './config-seal';

const KEY = '0123456789abcdef0123456789abcdef';

describe('config-seal', () => {
  it('classifies secret vs identifier keys', () => {
    expect(isSecretKey('tokenSecret')).toBe(true);
    expect(isSecretKey('password')).toBe(true);
    expect(isSecretKey('privateKeyPem')).toBe(true);
    expect(isSecretKey('clientSecret')).toBe(true);
    // identifiers are NOT secrets
    expect(isSecretKey('accessKeyId')).toBe(false);
    expect(isSecretKey('clientId')).toBe(false);
    expect(isSecretKey('tokenId')).toBe(false);
    expect(isSecretKey('apiUrl')).toBe(false);
  });

  it('redacts secret values but keeps identifiers', () => {
    const r = redactConfig({ apiUrl: 'https://x', tokenSecret: 'abc', clientId: 'cid' });
    expect(r.apiUrl).toBe('https://x');
    expect(r.clientId).toBe('cid');
    expect(r.tokenSecret).toBe('••••••••');
  });

  it('seals and unseals round-trip', () => {
    const cfg = { apiUrl: 'https://x', password: 'hunter2', n: 3 };
    const sealed = sealConfig(cfg, KEY);
    expect(sealed).not.toContain('hunter2');
    expect(unsealConfig(sealed, KEY)).toEqual(cfg);
  });

  it('merge keeps masked values unchanged and applies real edits', () => {
    const prev = { apiUrl: 'https://old', password: 'secret', tokenId: 't1' };
    const incoming = { apiUrl: 'https://new', password: '••••••••', tokenId: 't2' };
    const merged = mergeSealedConfig(prev, incoming);
    expect(merged.apiUrl).toBe('https://new'); // edited
    expect(merged.password).toBe('secret'); // masked → unchanged
    expect(merged.tokenId).toBe('t2'); // edited
  });
});
