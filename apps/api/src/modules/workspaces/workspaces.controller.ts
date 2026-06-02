import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { type CreateWorkspaceDto, createWorkspaceSchema } from '@chista/contracts';
import { type AuthUser, CurrentUser, RequirePermissions } from '../../common/decorators';
import { ZodPipe } from '../../common/zod.pipe';
import { WorkspacesService } from './workspaces.service';

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

  @RequirePermissions('WORKSPACE_VIEW')
  @Get('launchable')
  launchable() {
    return this.workspaces.launchable();
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
}
