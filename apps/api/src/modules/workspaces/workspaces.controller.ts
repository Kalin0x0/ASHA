import { Body, Controller, Delete, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  type CreateWorkspaceDto,
  createWorkspaceSchema,
  type UpdateWorkspaceDto,
  updateWorkspaceSchema,
} from '@asha/contracts';
import { z } from 'zod';
import { Audit } from '../../common/audit.interceptor';
import { type AuthUser, CurrentUser, RequirePermissions } from '../../common/decorators';
import { ZodPipe } from '../../common/zod.pipe';
import { WorkspacesService } from './workspaces.service';

const userAccessSchema = z.object({
  state: z.enum(['granted', 'blocked']),
});
type UserAccessDto = z.infer<typeof userAccessSchema>;

const assignmentsSchema = z.object({
  userIds: z.array(z.string()).max(1000).default([]),
  groupIds: z.array(z.string()).max(1000).default([]),
});
type AssignmentsDto = z.infer<typeof assignmentsSchema>;

@ApiTags('workspaces')
@ApiBearerAuth()
@Controller('workspaces')
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspacesService) {}

  // WORKSPACE_VIEW is held by every seeded end user, so the service — not this
  // guard — decides who sees the full catalog and who sees only their grants.
  @RequirePermissions('WORKSPACE_VIEW')
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.workspaces.list(user);
  }

  /** The workspaces the CURRENT user may launch (access-filtered per assignment). */
  @RequirePermissions('WORKSPACE_VIEW')
  @Get('launchable')
  launchable(@CurrentUser() user: AuthUser) {
    return this.workspaces.launchableForUser(user);
  }

  @RequirePermissions('WORKSPACE_VIEW')
  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.workspaces.get(id, user);
  }

  @RequirePermissions('WORKSPACE_CREATE')
  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(createWorkspaceSchema)) dto: CreateWorkspaceDto) {
    return this.workspaces.create(user.orgId, dto);
  }

  @RequirePermissions('WORKSPACE_EDIT')
  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(updateWorkspaceSchema)) dto: UpdateWorkspaceDto,
  ) {
    return this.workspaces.update(user.orgId, id, dto);
  }

  /** Replace a workspace's access grants (users + groups). Empty arrays ⇒ everyone. */
  @Audit('workspace.assign', { targetType: 'Workspace' })
  @RequirePermissions('WORKSPACE_EDIT')
  @Patch(':id/assignments')
  setAssignments(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(assignmentsSchema)) dto: AssignmentsDto,
  ) {
    return this.workspaces.setAssignments(user.orgId, id, dto);
  }

  // ── Single-subject access, for a UI that toggles one row at a time ──────────
  // `PATCH :id/assignments` replaces the whole roster, so a client that only
  // wants to add one person must re-send every other grant — and a stale list
  // then silently revokes people. These four are idempotent and touch exactly
  // the pair named in the URL.

  // A person has three standings, not two: an explicit grant, an explicit block
  // that overrides what a group would give them, and no row at all (inherit).
  // The block is the only way to say "everyone except her" — you cannot remove
  // someone from the everyone-group.
  @Audit('workspace.access.set', { targetType: 'Workspace' })
  @RequirePermissions('WORKSPACE_EDIT')
  @Put(':id/access/users/:userId')
  setUserAccess(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body(new ZodPipe(userAccessSchema)) dto: UserAccessDto,
  ) {
    return this.workspaces.setUserAccess(user.orgId, id, userId, dto.state);
  }

  /** Clear any explicit grant or block — the person falls back to their groups. */
  @Audit('workspace.access.set', { targetType: 'Workspace' })
  @RequirePermissions('WORKSPACE_EDIT')
  @Delete(':id/access/users/:userId')
  clearUserAccess(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('userId') userId: string) {
    return this.workspaces.setUserAccess(user.orgId, id, userId, 'inherit');
  }

  @Audit('workspace.access.grant', { targetType: 'Workspace' })
  @RequirePermissions('WORKSPACE_EDIT')
  @Put(':id/access/groups/:groupId')
  grantGroup(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('groupId') groupId: string) {
    return this.workspaces.setGroupAccess(user.orgId, id, groupId, true);
  }

  @Audit('workspace.access.revoke', { targetType: 'Workspace' })
  @RequirePermissions('WORKSPACE_EDIT')
  @Delete(':id/access/groups/:groupId')
  revokeGroup(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('groupId') groupId: string) {
    return this.workspaces.setGroupAccess(user.orgId, id, groupId, false);
  }

  @RequirePermissions('WORKSPACE_DELETE')
  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.workspaces.remove(user.orgId, id);
  }
}
