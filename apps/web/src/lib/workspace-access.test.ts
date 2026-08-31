import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { WORKSPACE_ACCESS_RANK, WORKSPACE_TYPE_ORDER, workspaceAccessFor } from './workspace-access';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const ws = (users: string[] = [], groups: string[] = []) => ({
  assignedUserIds: users,
  assignedGroupIds: groups,
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
    const { direct, group, everyone, none } = WORKSPACE_ACCESS_RANK;
    expect(direct).toBeLessThan(group);
    expect(group).toBeLessThan(everyone);
    expect(everyone).toBeLessThan(none);
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
