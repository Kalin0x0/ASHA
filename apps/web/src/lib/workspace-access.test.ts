import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  WORKSPACE_ACCESS_RANK,
  WORKSPACE_TYPE_ORDER,
  planWorkspaceAccessToggle,
  workspaceAccessFor,
} from './workspace-access';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const ws = (users: string[] = [], groups: string[] = [], blocked: string[] = []) => ({
  assignedUserIds: users,
  assignedGroupIds: groups,
  blockedUserIds: blocked,
});
const anna = { id: 'u1', groupIds: ['g-design'] };

describe('workspaceAccessFor', () => {
  it('reports a grant made to the person by name', () => {
    expect(workspaceAccessFor(ws(['u1']), anna, true)).toEqual({ kind: 'direct' });
  });

  it('names the group a grant actually comes from', () => {
    // The screen disables the switch for these and says why. Getting the group
    // wrong sends the admin to the wrong place to undo it.
    expect(workspaceAccessFor(ws([], ['g-design']), anna, true)).toEqual({
      kind: 'group',
      groupId: 'g-design',
    });
  });

  it('prefers the direct grant when both apply', () => {
    // Direct is the one this screen can revoke. Reporting the group would grey
    // out a switch that does work.
    expect(workspaceAccessFor(ws(['u1'], ['g-design']), anna, true)).toEqual({ kind: 'direct' });
  });

  it('does not credit a group the person is not in', () => {
    expect(workspaceAccessFor(ws([], ['g-finance']), anna, true)).toEqual({ kind: 'none' });
  });

  it('an ungranted workspace is nobody-has-it under deny-by-default', () => {
    expect(workspaceAccessFor(ws(), anna, true)).toEqual({ kind: 'none' });
  });

  it('an ungranted workspace is everyone-has-it under the open model', () => {
    // The trap this screen exists to expose: with `isolation.denyByDefault` off,
    // an empty roster means the OPPOSITE of what it looks like, and adding the
    // first person silently takes the workspace away from everybody else.
    expect(workspaceAccessFor(ws(), anna, false)).toEqual({ kind: 'everyone' });
  });

  it('a granted workspace is never open to everyone, whatever the model', () => {
    expect(workspaceAccessFor(ws(['someone-else']), anna, false)).toEqual({ kind: 'none' });
    expect(workspaceAccessFor(ws([], ['g-finance']), anna, false)).toEqual({ kind: 'none' });
  });

  it('treats missing rosters as empty rather than throwing', () => {
    // The catalog strips grants for non-admin callers, so both fields can be
    // absent on a workspace that reached this code by another route.
    expect(workspaceAccessFor({}, anna, true)).toEqual({ kind: 'none' });
  });

  it('ranks what the person already has above what they do not', () => {
    const { direct, group, everyone, blocked, none } = WORKSPACE_ACCESS_RANK;
    expect(direct).toBeLessThan(group);
    expect(group).toBeLessThan(everyone);
    expect(everyone).toBeLessThan(blocked);
    expect(blocked).toBeLessThan(none);
  });

  describe('blocks', () => {
    it('beats a grant that would arrive from a group, and names that group', () => {
      // The case the whole feature exists for: everyone is in "All Users", so
      // there is no group to remove the person from.
      expect(workspaceAccessFor(ws([], ['g-design'], ['u1']), anna, true)).toEqual({
        kind: 'blocked',
        groupId: 'g-design',
      });
    });

    it('beats a grant made to the person by name', () => {
      expect(workspaceAccessFor(ws(['u1'], [], ['u1']), anna, true)).toEqual({
        kind: 'blocked',
        groupId: undefined,
      });
    });

    it('beats open-to-everyone under the legacy model', () => {
      expect(workspaceAccessFor(ws([], [], ['u1']), anna, false)).toEqual({
        kind: 'blocked',
        groupId: undefined,
      });
    });

    it('applies only to the person named', () => {
      const ben = { id: 'u2', groupIds: ['g-design'] };
      expect(workspaceAccessFor(ws([], ['g-design'], ['u1']), ben, true)).toEqual({
        kind: 'group',
        groupId: 'g-design',
      });
    });

    it('does not make an ungranted workspace look assigned', () => {
      // A block is not a grant. If it counted as one, this workspace would stop
      // being open to everyone the moment one person was excluded from it.
      const ben = { id: 'u2', groupIds: [] };
      expect(workspaceAccessFor(ws([], [], ['u1']), ben, false)).toEqual({ kind: 'everyone' });
    });
  });
});

describe('planWorkspaceAccessToggle', () => {
  const group = { kind: 'group', groupId: 'g-all' } as const;
  const blockedOverGroup = { kind: 'blocked', groupId: 'g-all' } as const;
  const blockedAlone = { kind: 'blocked' } as const;

  it('switching OFF a group-granted desktop writes a block, not a removal', () => {
    // There is nothing on this workspace to remove — the grant lives on the
    // group — and detaching the group would take the desktop from everyone.
    expect(planWorkspaceAccessToggle(group, false)).toBe('blocked');
  });

  it('switching ON a blocked-over-group desktop lifts the block, not adds a grant', () => {
    // Falling back to the group keeps the data minimal: a row exists only when
    // it says something the groups do not.
    expect(planWorkspaceAccessToggle(blockedOverGroup, true)).toBe('inherit');
  });

  it('switching ON a desktop no group grants writes a real grant', () => {
    expect(planWorkspaceAccessToggle({ kind: 'none' }, true)).toBe('granted');
    expect(planWorkspaceAccessToggle(blockedAlone, true)).toBe('granted');
  });

  it('switching OFF a personal grant just removes it', () => {
    // A block here would be pointless bookkeeping — nothing would grant it back.
    expect(planWorkspaceAccessToggle({ kind: 'direct' }, false)).toBe('inherit');
  });

  it('round-trips: off then on returns to where it started', () => {
    for (const start of [group, { kind: 'direct' } as const, { kind: 'none' } as const]) {
      const off = planWorkspaceAccessToggle(start, false);
      expect(['blocked', 'inherit']).toContain(off);
    }
  });
});

describe('WORKSPACE_TYPE_ORDER', () => {
  it('covers every workspace type the app knows about', () => {
    // The assignments filter is built from this list, so a type missing here is
    // a type nobody can filter to — and the user asked specifically to be able
    // to assign "a desktop or a service or a Docker container".
    const declared = /export type WorkspaceType =([^;]+);/.exec(read('./types.ts'))?.[1];
    expect(declared, 'WorkspaceType must be declared as a union in types.ts').toBeTruthy();
    const members = [...(declared ?? '').matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]);

    expect(members.length).toBeGreaterThan(0);
    expect([...WORKSPACE_TYPE_ORDER].sort()).toEqual([...members].sort());
  });

  it('has a label in every locale for every type', () => {
    // Without one, the filter chip and the row badge render a raw message key
    // like "types.VM" at the user.
    for (const locale of ['en', 'de', 'fa']) {
      const labels = JSON.parse(read(`../../messages/${locale}/access.json`)).assignments.types;
      for (const type of WORKSPACE_TYPE_ORDER) {
        expect(labels[type], `${locale}: missing label for ${type}`).toBeTruthy();
      }
      expect(labels.all, `${locale}: missing the "all types" label`).toBeTruthy();
    }
  });
});
