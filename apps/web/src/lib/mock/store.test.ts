import { describe, expect, it } from 'vitest';
import { store } from './store';

describe('MockStore.createUser', () => {
  it('creates a user, normalises the email, derives a username, and prepends it', () => {
    const before = store.getData().users.length;
    const u = store.createUser({ email: 'Brand.New@Chista.LOCAL', displayName: 'Brand New' });
    expect(u.email).toBe('brand.new@chista.local');
    expect(u.username).toBe('brand.new');
    expect(u.name).toBe('Brand New');
    expect(u.status).toBe('ACTIVE');
    expect(store.getData().users[0]!.id).toBe(u.id);
    expect(store.getData().users.length).toBe(before + 1);
  });

  it('rejects a missing email', () => {
    expect(() => store.createUser({ email: '   ' })).toThrow(/email/i);
  });

  it('rejects a duplicate email/username', () => {
    store.createUser({ email: 'dupe@chista.local' });
    expect(() => store.createUser({ email: 'dupe@chista.local' })).toThrow(/already exists/i);
  });
});
