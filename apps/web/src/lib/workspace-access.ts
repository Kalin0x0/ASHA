import type { UserRow, Workspace, WorkspaceType } from './types';

/**
 * Why a person can — or cannot — open a workspace.
 *
 * The distinction is the whole point of the assignments screen. Access can
 * arrive from three different places and be taken away by a fourth, and a switch
 * that showed only on/off would be lying about at least one of them:
 *
 * - a grant made to this person by name,
 * - a grant made to a group they belong to,
 * - under the legacy open model, no grants anywhere — which means *everyone*,
 *   the exact opposite of what an empty roster looks like,
 * - an explicit block, which overrides all of the above for this one person.
 */
export type WorkspaceAccess =
  /** Granted to this person by name. */
  | { kind: 'direct' }
  /** Granted through a group they belong to. */
  | { kind: 'group'; groupId: string }
  /** No grants at all AND the org runs the open model ⇒ everyone sees it. */
  | { kind: 'everyone' }
  /**
   * Explicitly blocked. Carries the group that *would* have granted it, so the
   * screen can say "would come from All Users, switched off for this person"
   * rather than an unexplained off switch.
   */
  | { kind: 'blocked'; groupId?: string }
  | { kind: 'none' };

/**
 * `denyByDefault` mirrors the org's `isolation.denyByDefault` setting, which the
 * API reads as "absent ⇒ on". Pass the real value: hardcoding the secure default
 * would label an ungranted workspace "nobody has this" on a deployment where in
 * fact everybody does.
 */
export function workspaceAccessFor(
  workspace: Pick<Workspace, 'assignedUserIds' | 'assignedGroupIds' | 'blockedUserIds'>,
  user: Pick<UserRow, 'id' | 'groupIds'>,
  denyByDefault: boolean,
): WorkspaceAccess {
  const users = workspace.assignedUserIds ?? [];
  const groups = workspace.assignedGroupIds ?? [];
  const blocked = workspace.blockedUserIds ?? [];
  const viaGroup = groups.find((g) => user.groupIds.includes(g));

  // A block beats everything, exactly as the server's own filter does — this is
  // the only way to express "everyone except her" when the grant comes from a
  // group nobody can be removed from.
  if (blocked.includes(user.id)) return { kind: 'blocked', groupId: viaGroup };

  // Direct beats group: it is the grant this screen removes most cheaply, so
  // reporting the group instead would send the admin somewhere they need not go.
  if (users.includes(user.id)) return { kind: 'direct' };
  if (viaGroup) return { kind: 'group', groupId: viaGroup };

  if (users.length === 0 && groups.length === 0 && !denyByDefault) return { kind: 'everyone' };
  return { kind: 'none' };
}

/** What flipping the switch has to do on the wire, given where access stands. */
export type AccessToggle = 'granted' | 'blocked' | 'inherit';

/**
 * Turning the switch on or off is not the same request every time — it depends
 * on whether a group is granting underneath.
 *
 * Switching OFF a desktop the person only has through a group cannot be a
 * removal: there is nothing on this workspace to remove, and deleting the group
 * link would change it for everybody. It has to become a block. Conversely,
 * switching a blocked row back ON should lift the block and let the group grant
 * resurface, rather than pinning a redundant personal grant on top of it.
 *
 * The result is that a row exists only when it says something the groups do not.
 */
export function planWorkspaceAccessToggle(access: WorkspaceAccess, on: boolean): AccessToggle {
  const grantedByGroup =
    access.kind === 'group' || (access.kind === 'blocked' && access.groupId !== undefined);

  if (on) return grantedByGroup ? 'inherit' : 'granted';
  return grantedByGroup ? 'blocked' : 'inherit';
}

/** Sort order for the assignments list: what the person already has, first. */
export const WORKSPACE_ACCESS_RANK: Record<WorkspaceAccess['kind'], number> = {
  direct: 0,
  group: 1,
  everyone: 2,
  blocked: 3,
  none: 4,
};

/**
 * The kinds of thing a person can be given, in the order an operator thinks of
 * them: the streamed container first, since that is what most catalogs are made
 * of. "Desktop", "service" and "Docker" are all entries in this one list — the
 * assignments filter is built from it, so a type missing here is a type nobody
 * can filter to.
 */
export const WORKSPACE_TYPE_ORDER: WorkspaceType[] = ['CONTAINER', 'SERVER', 'REMOTE_APP', 'VM', 'LINK'];
