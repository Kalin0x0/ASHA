import type { UserRow, Workspace, WorkspaceType } from './types';

/**
 * Why a person can — or cannot — open a workspace.
 *
 * The distinction is the whole point of the assignments screen. A grant that
 * arrives through a group cannot be taken away from one person, so a switch
 * offering to do it would be lying; and under the legacy open model a workspace
 * nobody is granted is visible to *everybody*, which is the exact opposite of
 * what an empty roster looks like.
 */
export type WorkspaceAccess =
  /** Granted to this person by name. Revocable from the assignments screen. */
  | { kind: 'direct' }
  /** Granted through a group they belong to. Only removable at the group. */
  | { kind: 'group'; groupId: string }
  /** No grants at all AND the org runs the open model ⇒ everyone sees it. */
  | { kind: 'everyone' }
  | { kind: 'none' };

/**
 * `denyByDefault` mirrors the org's `isolation.denyByDefault` setting, which the
 * API reads as "absent ⇒ on". Pass the real value: hardcoding the secure default
 * would label an ungranted workspace "nobody has this" on a deployment where in
 * fact everybody does.
 */
export function workspaceAccessFor(
  workspace: Pick<Workspace, 'assignedUserIds' | 'assignedGroupIds'>,
  user: Pick<UserRow, 'id' | 'groupIds'>,
  denyByDefault: boolean,
): WorkspaceAccess {
  const users = workspace.assignedUserIds ?? [];
  const groups = workspace.assignedGroupIds ?? [];

  // Direct beats group: it is the grant this screen can actually revoke, so
  // reporting the group instead would disable a switch that does work.
  if (users.includes(user.id)) return { kind: 'direct' };

  const viaGroup = groups.find((g) => user.groupIds.includes(g));
  if (viaGroup) return { kind: 'group', groupId: viaGroup };

  if (users.length === 0 && groups.length === 0 && !denyByDefault) return { kind: 'everyone' };
  return { kind: 'none' };
}

/** Sort order for the assignments list: what the person already has, first. */
export const WORKSPACE_ACCESS_RANK: Record<WorkspaceAccess['kind'], number> = {
  direct: 0,
  group: 1,
  everyone: 2,
  none: 3,
};

/**
 * The kinds of thing a person can be given, in the order an operator thinks of
 * them: the streamed container first, since that is what most catalogs are made
 * of. "Desktop", "service" and "Docker" are all entries in this one list — the
 * assignments filter is built from it, so a type missing here is a type nobody
 * can filter to.
 */
export const WORKSPACE_TYPE_ORDER: WorkspaceType[] = ['CONTAINER', 'SERVER', 'REMOTE_APP', 'VM', 'LINK'];
