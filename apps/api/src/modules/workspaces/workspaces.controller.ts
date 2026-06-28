import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
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

  @RequirePermissions('WORKSPACE_VIEW')
  @Get()
  list() {
    return this.workspaces.list();
  }

  /** The workspaces the CURRENT user may launch (access-filtered per assignment). */
  @RequirePermissions('WORKSPACE_VIEW')
  @Get('launchable')
  launchable(@CurrentUser() user: AuthUser) {
    return this.workspaces.launchableForUser(user);
  }

  @RequirePermissions('WORKSPACE_VIEW')
  @Get(':id')
  get(@Param('id') id: string) {
    return this.workspaces.get(id);
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

  @RequirePermissions('WORKSPACE_DELETE')
  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.workspaces.remove(user.orgId, id);
  }
}
