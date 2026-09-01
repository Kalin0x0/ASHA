import type { Prisma } from '@asha/db';

/**
 * The single definition of "may this user open this workspace".
 *
 * It used to be written twice — once to filter the catalog, once to guard the
 * launch endpoint — which is precisely how an authorization check drifts: widen
 * one and the other quietly keeps letting people in, or narrow one and a user
 * sees a workspace they then cannot start. Both callers build their `where` from
 * here so the two can never disagree again.
 *
 * The rules, in order of authority:
 *
 * 1. **An explicit block wins.** A `WorkspaceUser` row with `denied = true`
 *    removes access no matter where it would otherwise come from. This is the
 *    only way to say "not this one person" about a grant that arrives through a
 *    group — you cannot take someone out of the everyone-group, and detaching
 *    the group from the workspace would change it for the whole company.
 * 2. **A grant** is a direct `WorkspaceUser` row (`denied = false`) or a group
 *    the user belongs to.
 * 3. **With `denyByDefault` off** (the legacy open model) a workspace nobody has
 *    been granted is visible to everyone. Blocks do NOT count as grants here: a
 *    workspace whose only rows are blocks is still an ungranted workspace, and
 *    counting them would invert it into "visible only to the people denied".
 *
 * System admins bypass this entirely and never reach it.
 */
export function workspaceAccessWhere(opts: {
  userId: string;
  groupIds: string[];
  denyByDefault: boolean;
}): Prisma.WorkspaceWhereInput {
  const { userId, groupIds, denyByDefault } = opts;

  const grants: Prisma.WorkspaceWhereInput[] = [
    { assignedUsers: { some: { userId, denied: false } } },
    ...(groupIds.length ? [{ groups: { some: { id: { in: groupIds } } } }] : []),
  ];

  // No grants at all ⇒ everyone, but only under the open model. `none: { denied:
  // false }` and not `none: {}`: a block must not make a workspace look assigned.
  const openToEveryone: Prisma.WorkspaceWhereInput = {
    groups: { none: {} },
    assignedUsers: { none: { denied: false } },
  };

  return {
    // ANDed with the OR below, so a block overrides every branch of it.
    assignedUsers: { none: { userId, denied: true } },
    OR: denyByDefault ? grants : [openToEveryone, ...grants],
  };
}
