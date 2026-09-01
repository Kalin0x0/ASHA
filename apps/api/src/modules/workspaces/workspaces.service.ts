import { BadRequestException, ConflictException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import type { CreateWorkspaceDto, UpdateWorkspaceDto } from '@asha/contracts';
import { prisma } from '@asha/db';
import type { AuthUser } from '../../common/decorators';
import { RbacService } from '../../common/rbac.service';
import { SessionsService } from '../sessions/sessions.service';
import { workspaceAccessWhere } from './workspace-access.where';

/** A person's standing on one workspace. See `setUserAccess`. */
export type WorkspaceUserAccess = 'granted' | 'blocked' | 'inherit';

/**
 * Permissions that mark a caller as admin-side and therefore entitled to the
 * FULL catalog including who each workspace is assigned to. `WORKSPACE_VIEW` is
 * deliberately not among them: every seeded end user (and every 10-minute demo
 * account) holds it, so gating on it would disclose the whole catalog — and the
 * per-workspace user roster — to anyone who can log in. The Operator role has
 * no WORKSPACE_EDIT but does have SESSION_VIEW_ANY, which is why that is in the
 * list: the admin sessions screen needs workspace names.
 */
const CATALOG_ADMIN_PERMISSIONS = ['SESSION_VIEW_ANY', 'WORKSPACE_CREATE', 'WORKSPACE_EDIT', 'IMAGE_MANAGE'];

/**
 * Drop the access-grant roster before handing a workspace to an ordinary user.
 * Who else is assigned to a workspace is admin information — knowing it lets a
 * user enumerate colleagues and infer team structure from the catalog alone.
 */
function stripGrants<T extends { groups?: unknown; assignedUsers?: unknown }>(workspaces: T[]) {
  return workspaces.map(({ groups: _groups, assignedUsers: _assignedUsers, ...rest }) => rest as Omit<T, 'groups' | 'assignedUsers'>);
}

// Container/Server/Zone are all surfaced so the catalog can show what a
// workspace runs on (Docker image, RDP/VNC/SSH server, deployment zone).
// Access grants (groups + direct users) are included so the admin UI can show
// who a workspace is assigned to; empty on both ⇒ visible to everyone.
const WORKSPACE_INCLUDE = {
  image: true,
  server: { include: { zone: true } },
  zone: true,
  groups: { select: { id: true, name: true } },
  assignedUsers: { select: { userId: true, denied: true } },
} as const;

@Injectable()
export class WorkspacesService {
  constructor(
    private readonly sessions: SessionsService,
    // Optional so existing unit tests can construct the service positionally.
    // Absent ⇒ nobody qualifies as admin-side, i.e. it fails CLOSED.
    @Optional() private readonly rbac?: RbacService,
  ) {}

  /** True when the caller may see the full catalog and its assignment roster. */
  private async isCatalogAdmin(user: AuthUser): Promise<boolean> {
    if (user.isSystemAdmin) return true;
    if (!this.rbac) return false;
    const granted = await this.rbac.effectivePermissions(user.sub);
    return CATALOG_ADMIN_PERMISSIONS.some((p) => granted.has(p));
  }

  /**
   * The catalog. Admin-side callers get every workspace plus its grants; an
   * ordinary user gets only what they may actually launch, with the grant
   * roster stripped — the route is reachable with plain `WORKSPACE_VIEW`, which
   * every end user holds, so the filtering has to happen here rather than at
   * the guard.
   */
  async list(user: AuthUser) {
    if (await this.isCatalogAdmin(user)) {
      return prisma.workspace.findMany({ include: WORKSPACE_INCLUDE, orderBy: { friendlyName: 'asc' } });
    }
    return stripGrants(await this.launchableForUser(user));
  }

  launchable() {
    return prisma.workspace.findMany({ where: { enabled: true }, include: WORKSPACE_INCLUDE });
  }

  /**
   * Workspaces the given user may launch (this also covers server-backed
   * *services*, which are modelled as `type: SERVER` workspaces). System admins
   * always see all.
   *
   * Non-admin visibility is governed by the `isolation.denyByDefault` org
   * setting (default ON — the secure default): each user sees ONLY the
   * workspaces granted to them directly or via a group. With the setting turned
   * OFF, the legacy behaviour applies — an ungranted workspace (no group AND no
   * direct-user grant) is visible to everyone.
   */
  async launchableForUser(user: AuthUser) {
    if (user.isSystemAdmin) return this.launchable();
    const [memberships, denyByDefault] = await Promise.all([
      prisma.userGroup.findMany({ where: { userId: user.sub }, select: { groupId: true } }),
      this.isDenyByDefault(user.orgId),
    ]);
    return prisma.workspace.findMany({
      where: {
        enabled: true,
        // Shared with the launch guard in SessionsService — see the module for
        // the rules. Seeing a workspace and being allowed to start it must never
        // be two different questions.
        ...workspaceAccessWhere({
          userId: user.sub,
          groupIds: memberships.map((m) => m.groupId),
          denyByDefault,
        }),
      },
      include: WORKSPACE_INCLUDE,
      orderBy: { friendlyName: 'asc' },
    });
  }

  /**
   * Whether strict per-user isolation is on for this org (deny-by-default).
   * Reads the `isolation.denyByDefault` ORG setting; absent ⇒ ON (secure
   * default). Only an explicit `false` opts back into the open, legacy model.
   */
  private async isDenyByDefault(orgId: string): Promise<boolean> {
    const row = await prisma.setting.findUnique({
      where: { scope_orgId_zoneId_key: { scope: 'ORG', orgId, zoneId: '', key: 'isolation.denyByDefault' } },
      select: { valueJson: true },
    });
    return row?.valueJson !== false;
  }

  /**
   * Unfiltered read for internal callers that have already been authorized by
   * their own route guard (create/update/assignments all return the fresh row).
   */
  private async findOrThrow(id: string) {
    const workspace = await prisma.workspace.findUnique({ where: { id }, include: WORKSPACE_INCLUDE });
    if (!workspace) throw new NotFoundException('Workspace not found');
    return workspace;
  }

  async get(id: string, user: AuthUser) {
    const workspace = await this.findOrThrow(id);
    if (await this.isCatalogAdmin(user)) return workspace;

    // An ordinary user may only read a workspace they were actually granted —
    // 404 rather than 403 so this cannot enumerate the catalog by id.
    const granted = await this.launchableForUser(user);
    if (!granted.some((w) => w.id === workspace.id)) throw new NotFoundException('Workspace not found');
    return stripGrants([workspace])[0]!;
  }

  async create(orgId: string, dto: CreateWorkspaceDto) {
    // Workspace.name is unique per org — fail clearly instead of a raw P2002,
    // and before we create any backing image (so we never orphan one).
    const clash = await prisma.workspace.findFirst({ where: { orgId, name: dto.name } });
    if (clash) throw new ConflictException('A workspace with this name already exists');

    // Server-backed placement (SERVER/VM/REMOTE_APP → RDP/VNC/SSH machines, incl.
    // Windows desktops). Validate an explicitly-chosen zone; a server's own zone
    // is already valid, so it's inherited without a second lookup.
    const serverId = dto.serverId ?? null;
    let zoneId = dto.zoneId ?? null;
    if (zoneId) {
      const zone = await prisma.deploymentZone.findFirst({ where: { id: zoneId, orgId } });
      if (!zone) throw new BadRequestException('Selected zone was not found');
    }
    if (serverId) {
      const server = await prisma.server.findFirst({ where: { id: serverId, orgId } });
      if (!server) throw new BadRequestException('Selected server was not found');
      if (!zoneId) zoneId = server.zoneId;
    }
    if (dto.type === 'SERVER' && !serverId) {
      throw new BadRequestException('Choose a server for a server-backed workspace');
    }

    // Container placement: an explicit imageId wins; otherwise, if a dockerImage
    // was supplied, create+link one so the workspace is launchable right away.
    let imageId = dto.imageId ?? null;
    if (dto.type === 'CONTAINER' && !imageId && dto.dockerImage) {
      const image = await prisma.image.create({
        data: {
          orgId,
          name: dto.name,
          friendlyName: dto.friendlyName,
          dockerImage: dto.dockerImage,
          protocol: 'KASMVNC',
          available: true,
          runConfigDefaults: { ports: [6901] },
        },
      });
      imageId = image.id;
    }

    return prisma.workspace.create({
      data: {
        orgId,
        name: dto.name,
        friendlyName: dto.friendlyName,
        description: dto.description,
        iconUrl: dto.iconUrl,
        type: dto.type,
        imageId,
        serverId,
        zoneId,
        enabled: dto.enabled ?? true,
        categories: dto.categories,
        coresLimit: dto.coresLimit,
        memLimitMb: dto.memLimitMb,
        gpuCount: dto.gpuCount,
        gpu: (dto.gpu ?? {}) as object,
        dlp: (dto.dlp ?? {}) as object,
        isDemo: dto.isDemo ?? false,
        dockerConfig: dto.dockerConfig as object,
      },
      include: WORKSPACE_INCLUDE,
    });
  }

  // updateMany/deleteMany are org-scoped (explicit orgId in the where, plus the
  // tenant extension), so a tenant can never touch another org's workspace.
  async update(orgId: string, id: string, dto: UpdateWorkspaceDto) {
    const res = await prisma.workspace.updateMany({
      where: { id, orgId },
      data: {
        name: dto.name,
        friendlyName: dto.friendlyName,
        description: dto.description,
        iconUrl: dto.iconUrl,
        type: dto.type,
        imageId: dto.imageId,
        serverId: dto.serverId,
        zoneId: dto.zoneId,
        categories: dto.categories,
        coresLimit: dto.coresLimit,
        memLimitMb: dto.memLimitMb,
        gpuCount: dto.gpuCount,
        gpu: dto.gpu as object | undefined,
        dlp: dto.dlp as object | undefined,
        isDemo: dto.isDemo,
        dockerConfig: dto.dockerConfig as object | undefined,
        enabled: dto.enabled,
      },
    });
    if (res.count === 0) throw new NotFoundException('Workspace not found');
    return this.findOrThrow(id);
  }

  /**
   * Replace a workspace's access grants. Empty arrays for BOTH ⇒ visible to
   * everyone. Groups use the GroupWorkspaces relation; users the WorkspaceUser
   * join. Only ids that belong to the caller's org are linked (defensive).
   */
  async setAssignments(orgId: string, id: string, dto: { userIds: string[]; groupIds: string[] }) {
    const workspace = await prisma.workspace.findFirst({ where: { id, orgId }, select: { id: true } });
    if (!workspace) throw new NotFoundException('Workspace not found');

    const [validUsers, validGroups] = await Promise.all([
      dto.userIds.length
        ? prisma.user.findMany({ where: { id: { in: dto.userIds }, orgId }, select: { id: true } })
        : Promise.resolve([] as { id: string }[]),
      dto.groupIds.length
        ? prisma.group.findMany({ where: { id: { in: dto.groupIds }, orgId }, select: { id: true } })
        : Promise.resolve([] as { id: string }[]),
    ]);

    await prisma.workspace.update({
      where: { id },
      data: {
        groups: { set: validGroups.map((g) => ({ id: g.id })) },
        assignedUsers: {
          // Only the GRANTS are replaced. A block is an exception someone set
          // deliberately ("everyone except her"), and this form has no field for
          // it — wiping blocks here would silently re-admit the excluded person
          // the next time anyone saved the workspace for an unrelated reason.
          deleteMany: { denied: false },
          create: validUsers.map((u) => ({ orgId, userId: u.id, denied: false })),
        },
      },
    });
    return this.findOrThrow(id);
  }

  /**
   * Grant or revoke ONE subject at a time, idempotently.
   *
   * `setAssignments` replaces the entire roster, which is the right shape for a
   * form with a Save button and the wrong shape for everything else: two admins
   * editing the same workspace silently overwrite each other, and a UI that just
   * wants to flip one person on has to re-send every other grant it happened to
   * have loaded — so a stale list quietly revokes people. These take a single
   * pair, so a click means exactly what it says.
   *
   * A person has three possible standings on a workspace, not two:
   *
   *   granted  — an explicit yes for this person
   *   blocked  — an explicit no that overrides a grant they would inherit from a
   *              group. Without it, "everyone except her" is unexpressible: you
   *              cannot remove someone from the everyone-group, and detaching
   *              the group from the workspace changes it for the whole company.
   *   inherit  — no row; whatever their groups say
   */
  async setUserAccess(orgId: string, workspaceId: string, userId: string, state: WorkspaceUserAccess) {
    await this.assertInOrg(orgId, workspaceId);
    const user = await prisma.user.findFirst({ where: { id: userId, orgId }, select: { id: true } });
    if (!user) throw new NotFoundException('User not found');

    if (state === 'inherit') {
      // No row at all: whatever the person's groups say now applies. This is how
      // both a direct grant and a block are lifted.
      await prisma.workspaceUser.deleteMany({ where: { workspaceId, userId } });
    } else {
      // Upsert, not create: a person can move between granted and blocked, and
      // the pair is unique — a plain create would be a 500 on the second click.
      const denied = state === 'blocked';
      await prisma.workspaceUser.upsert({
        where: { workspaceId_userId: { workspaceId, userId } },
        create: { orgId, workspaceId, userId, denied },
        update: { denied },
      });
    }
    return this.findOrThrow(workspaceId);
  }

  async setGroupAccess(orgId: string, workspaceId: string, groupId: string, granted: boolean) {
    await this.assertInOrg(orgId, workspaceId);
    const group = await prisma.group.findFirst({ where: { id: groupId, orgId }, select: { id: true } });
    if (!group) throw new NotFoundException('Group not found');

    await prisma.workspace.update({
      where: { id: workspaceId },
      // `connect`/`disconnect` on an implicit m2m are both idempotent, and
      // neither disturbs the groups this call was not told about.
      data: { groups: granted ? { connect: { id: groupId } } : { disconnect: { id: groupId } } },
    });
    return this.findOrThrow(workspaceId);
  }

  private async assertInOrg(orgId: string, workspaceId: string) {
    const ws = await prisma.workspace.findFirst({ where: { id: workspaceId, orgId }, select: { id: true } });
    if (!ws) throw new NotFoundException('Workspace not found');
  }

  async remove(orgId: string, id: string) {
    const ws = await prisma.workspace.findFirst({ where: { id, orgId }, select: { id: true } });
    if (!ws) throw new NotFoundException('Workspace not found');

    // Drain before delete: Session.workspace is onDelete: Cascade, so a bare
    // delete would hard-remove every session row (live user sessions AND staged
    // pool sessions) and leave their containers running orphaned with nothing
    // left to tear them down. Tear each non-terminal session down first — this
    // also drains the workspace's staging pool.
    const live = await prisma.session.findMany({
      where: { workspaceId: id, status: { notIn: ['DESTROYED', 'TERMINATING', 'ERROR'] } },
      select: { id: true, orgId: true, zoneId: true, containerId: true, kasmId: true, agentId: true },
    });
    for (const s of live) {
      await this.sessions.destroy(s, 'workspace_deleted');
    }

    await prisma.workspace.deleteMany({ where: { id, orgId } });
    return { ok: true };
  }
}
