import { describe, expect, it } from 'vitest';
import { canAccessRoute, findNavItem, visibleNavGroups } from './nav';

const itemsFor = (perms: string[] | undefined, isSystemAdmin = false) =>
  visibleNavGroups(perms, isSystemAdmin).flatMap((g) => g.items.map((i) => i.href));

describe('assignments navigation', () => {
  it('is reachable by anyone who may edit a workspace', () => {
    // Access management is useless if the person who does it cannot find the
    // page. WORKSPACE_EDIT is exactly the permission the grant endpoints require,
    // so anyone allowed to make the change is allowed to see the screen.
    expect(itemsFor(['WORKSPACE_EDIT'])).toContain('/assignments');
  });

  it('is hidden from someone who may only look at the catalog', () => {
    expect(itemsFor(['WORKSPACE_VIEW'])).not.toContain('/assignments');
  });

  it('is visible to a system admin', () => {
    expect(itemsFor([], true)).toContain('/assignments');
  });

  it('resolves the route back to its nav entry, so the sidebar highlights it', () => {
    const hit = findNavItem('/assignments');
    expect(hit?.item.key).toBe('assignments');
    expect(hit?.group.key).toBe('access');
  });
});

describe('live monitor navigation', () => {
  it('needs observing AND listing, because the wall is a session list first', () => {
    // SESSION_OBSERVE opens the observation windows, but every tile comes from
    // GET /sessions, which is SESSION_VIEW_ANY. Offered on the first alone, an
    // Operator lands on a wall the API refuses to fill and reads the empty
    // state as "nobody is working".
    expect(itemsFor(['SESSION_OBSERVE', 'SESSION_VIEW_ANY'])).toContain('/sessions/monitor');
    expect(itemsFor(['SESSION_OBSERVE'])).not.toContain('/sessions/monitor');
  });

  it('is hidden from someone who may only list sessions', () => {
    expect(itemsFor(['SESSION_VIEW_ANY'])).not.toContain('/sessions/monitor');
  });

  it('turns a deep link away from someone who may observe but not list', () => {
    expect(canAccessRoute('/sessions/monitor', ['SESSION_OBSERVE'], false)).toBe(false);
    expect(canAccessRoute('/sessions/monitor', ['SESSION_OBSERVE', 'SESSION_VIEW_ANY'], false)).toBe(true);
  });

  it('leaves the plain OR items alone', () => {
    // The extra requirement is per item; nothing else may start demanding two
    // permissions because the wall does.
    expect(itemsFor(['REPORTING_VIEW'])).toContain('/dashboard');
  });

  it('is visible to a system admin', () => {
    expect(itemsFor([], true)).toContain('/sessions/monitor');
  });

  it('resolves the route back to its nav entry, so the sidebar highlights it', () => {
    // Unregistered, the longest-prefix match would land on /sessions and the
    // sidebar would highlight "Live Sessions" while the wall is open.
    const hit = findNavItem('/sessions/monitor');
    expect(hit?.item.key).toBe('monitor');
    expect(hit?.group.key).toBe('sessions');
  });
});
