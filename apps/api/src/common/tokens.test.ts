import { describe, expect, it } from 'vitest';
import { resolveTokens } from './tokens';

describe('resolveTokens', () => {
  const ctx = { username: 'alice', email: 'alice@corp.io', customAttributes: { dept: 'eng' } };

  it('interpolates known tokens recursively across objects and arrays', () => {
    const out = resolveTokens(
      { env: { USER: '{username}', MAIL: '{email}', D: '{custom_attribute_dept}' }, tags: ['{username}-vm'] },
      ctx,
    );
    expect(out).toEqual({
      env: { USER: 'alice', MAIL: 'alice@corp.io', D: 'eng' },
      tags: ['alice-vm'],
    });
  });

  it('also supports the bare {key} form for custom attributes', () => {
    expect(resolveTokens('{dept}', ctx)).toBe('eng');
  });

  it('leaves unknown tokens untouched', () => {
    expect(resolveTokens('{unknown}/{username}', ctx)).toBe('{unknown}/alice');
  });

  it('passes non-string values through unchanged', () => {
    expect(resolveTokens({ n: 5, b: true, x: null }, ctx)).toEqual({ n: 5, b: true, x: null });
  });
});
