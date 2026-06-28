import { describe, expect, it } from 'vitest';
import {
  PERMISSION_CATALOG,
  PERMISSION_KEYS,
  SUPER_ADMIN,
  SYSTEM_ROLE_MATRIX,
  expandRole,
  hasPermission,
} from './index';

describe('permission catalog', () => {
  it('has unique keys', () => {
    const keys = PERMISSION_CATALOG.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('PERMISSION_KEYS mirrors the catalog', () => {
    expect(PERMISSION_KEYS).toEqual(PERMISSION_CATALOG.map((p) => p.key));
  });

  it('every permission has a category and description', () => {
    for (const p of PERMISSION_CATALOG) {
      expect(p.category).toBeTruthy();
      expect(p.description).toBeTruthy();
    }
  });
});

describe('expandRole', () => {
  it('expands the wildcard to the full key list', () => {
    expect(expandRole(SUPER_ADMIN)).toEqual(PERMISSION_KEYS);
  });

  it('returns an explicit list unchanged', () => {
    const role = ['SESSION_VIEW', 'WORKSPACE_VIEW'];
    expect(expandRole(role)).toEqual(role);
  });
});

describe('SYSTEM_ROLE_MATRIX', () => {
  it('grants Super Admin the wildcard', () => {
    expect(SYSTEM_ROLE_MATRIX['Super Admin']).toBe(SUPER_ADMIN);
  });

  it('Administrator gets everything except LICENSE_MANAGE', () => {
    const admin = SYSTEM_ROLE_MATRIX.Administrator as string[];
    expect(admin).not.toContain('LICENSE_MANAGE');
    expect(admin).toContain('USER_CREATE');
    expect(admin.length).toBe(PERMISSION_KEYS.length - 1);
  });

  it('User is limited to self-service session permissions', () => {
    const user = SYSTEM_ROLE_MATRIX.User as string[];
    expect(user).toContain('SESSION_LAUNCH');
    expect(user).toContain('SESSION_TERMINATE_OWN');
    expect(user).not.toContain('SESSION_TERMINATE_ANY');
    expect(user).not.toContain('USER_DELETE');
  });

  it('only references keys that exist in the catalog', () => {
    for (const role of Object.values(SYSTEM_ROLE_MATRIX)) {
      if (role === SUPER_ADMIN) continue;
      for (const key of role) expect(PERMISSION_KEYS).toContain(key);
    }
  });
});

describe('hasPermission', () => {
  it('lets the wildcard holder do anything', () => {
    expect(hasPermission(['*'], 'ANYTHING_AT_ALL')).toBe(true);
    expect(hasPermission(new Set(['*']), ['A', 'B'], 'all')).toBe(true);
  });

  it('all mode requires every permission', () => {
    const granted = ['SESSION_VIEW', 'SESSION_LAUNCH'];
    expect(hasPermission(granted, ['SESSION_VIEW', 'SESSION_LAUNCH'], 'all')).toBe(true);
    expect(hasPermission(granted, ['SESSION_VIEW', 'AGENT_MANAGE'], 'all')).toBe(false);
  });

  it('any mode requires at least one permission', () => {
    const granted = ['SESSION_VIEW'];
    expect(hasPermission(granted, ['SESSION_VIEW', 'AGENT_MANAGE'], 'any')).toBe(true);
    expect(hasPermission(granted, ['AGENT_MANAGE', 'ZONE_MANAGE'], 'any')).toBe(false);
  });

  it('treats an empty requirement as satisfied', () => {
    expect(hasPermission([], [])).toBe(true);
  });

  it('accepts a single permission string', () => {
    expect(hasPermission(['SESSION_VIEW'], 'SESSION_VIEW')).toBe(true);
    expect(hasPermission(['SESSION_VIEW'], 'AGENT_MANAGE')).toBe(false);
  });

  it('accepts both Set and array inputs', () => {
    expect(hasPermission(new Set(['SESSION_VIEW']), 'SESSION_VIEW')).toBe(true);
  });
});
