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

describe('MockStore.createWorkspace', () => {
  it('creates a workspace, deriving a slug and prepending it to the catalog', () => {
    const before = store.getData().workspaces.length;
    const ws = store.createWorkspace({ friendlyName: 'Brave Browser', category: 'Browsers', dockerImage: 'kasmweb/brave:1.16.0' });
    expect(ws.name).toBe('brave-browser');
    expect(ws.friendlyName).toBe('Brave Browser');
    expect(ws.category).toBe('Browsers');
    expect(ws.enabled).toBe(true);
    expect(store.getData().workspaces[0]!.id).toBe(ws.id);
    expect(store.getData().workspaces.length).toBe(before + 1);
  });

  it('requires a name', () => {
    expect(() => store.createWorkspace({ friendlyName: '  ' })).toThrow(/name/i);
  });

  it('rejects a duplicate slug', () => {
    store.createWorkspace({ friendlyName: 'Dup Space' });
    expect(() => store.createWorkspace({ friendlyName: 'Dup Space' })).toThrow(/already exists/i);
  });
});
