import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { workspaceAccessWhere } from './workspace-access.where';

// `__dirname`, not `import.meta`: this app compiles to CommonJS.
const read = (rel: string) => readFileSync(join(__dirname, rel), 'utf8');

describe('workspaceAccessWhere', () => {
  it('never lets a block read as a grant', () => {
    const where = workspaceAccessWhere({ userId: 'u1', groupIds: [], denyByDefault: true });
    // Without `denied: false` here, blocking someone would GRANT them the
    // workspace — the row exists, so `some: { userId }` would match it.
    expect(where.OR).toContainEqual({ assignedUsers: { some: { userId: 'u1', denied: false } } });
  });

  it('applies the block outside the OR, so it overrides every way in', () => {
    for (const denyByDefault of [true, false]) {
      const where = workspaceAccessWhere({ userId: 'u1', groupIds: ['g1'], denyByDefault });
      // A top-level key is ANDed with the OR. Inside the OR it would merely be
      // one more alternative and would override nothing.
      expect(where.assignedUsers, `denyByDefault=${denyByDefault}`).toEqual({
        none: { userId: 'u1', denied: true },
      });
    }
  });

  it('does not count a block towards "this workspace is assigned to somebody"', () => {
    const where = workspaceAccessWhere({ userId: 'u1', groupIds: [], denyByDefault: false });
    // With `none: {}` a workspace nobody was granted, carrying a single block,
    // would stop being open-to-everyone — inverting it into "visible only to the
    // person explicitly denied".
    expect(where.OR).toContainEqual({ groups: { none: {} }, assignedUsers: { none: { denied: false } } });
    expect(where.OR).not.toContainEqual({ groups: { none: {} }, assignedUsers: { none: {} } });
  });

  it('omits the open-to-everyone branch under deny-by-default', () => {
    const where = workspaceAccessWhere({ userId: 'u1', groupIds: ['g1'], denyByDefault: true });
    expect(where.OR).toEqual([
      { assignedUsers: { some: { userId: 'u1', denied: false } } },
      { groups: { some: { id: { in: ['g1'] } } } },
    ]);
  });

  it('omits the group branch entirely for someone in no groups', () => {
    // `{ id: { in: [] } }` matches nothing, but emitting it would still put an
    // always-false branch into every query this user makes.
    const where = workspaceAccessWhere({ userId: 'u1', groupIds: [], denyByDefault: true });
    expect(where.OR).toEqual([{ assignedUsers: { some: { userId: 'u1', denied: false } } }]);
  });

  it('is the only definition — the catalog and the launch guard both call it', () => {
    // This predicate decides both what a user SEES and what they may START. It
    // was written out twice before, which is how the two drift apart: widen one
    // and the other quietly keeps letting people in; narrow one and users see
    // desktops that refuse to launch. Neither file may grow its own copy again.
    for (const file of [
      '../sessions/sessions.service.ts',
      './workspaces.service.ts',
    ]) {
      const source = read(file);
      expect(source, `${file} must call the shared predicate`).toContain('workspaceAccessWhere(');
      expect(source, `${file} must not hand-roll the grant clauses`).not.toMatch(
        /assignedUsers:\s*\{\s*some:\s*\{\s*userId/,
      );
    }
  });
});
