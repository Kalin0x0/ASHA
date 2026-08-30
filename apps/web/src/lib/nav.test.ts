import { describe, expect, it } from 'vitest';
import { findNavItem, visibleNavGroups } from './nav';

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
