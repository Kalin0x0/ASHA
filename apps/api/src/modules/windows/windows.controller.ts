import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { type CreateRemoteAppDto, createRemoteAppSchema } from '@chista/contracts';
import { type AuthUser, CurrentUser, RequirePermissions } from '../../common/decorators';
import { ZodPipe } from '../../common/zod.pipe';
import { WindowsService } from './windows.service';

@ApiTags('windows')
@ApiBearerAuth()
@Controller('workspaces/:workspaceId/remote-apps')
export class WindowsController {
  constructor(private readonly svc: WindowsService) {}

  @RequirePermissions('WORKSPACE_MANAGE')
  @Get()
  list(@CurrentUser() user: AuthUser, @Param('workspaceId') workspaceId: string) {
    return this.svc.listRemoteApps(user.orgId, workspaceId);
  }

  @RequirePermissions('WORKSPACE_MANAGE')
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(createRemoteAppSchema)) dto: CreateRemoteAppDto,
  ) {
    return this.svc.createRemoteApp(user.orgId, user.sub, dto);
  }

  @RequirePermissions('WORKSPACE_MANAGE')
  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @Body(new ZodPipe(createRemoteAppSchema.partial())) dto: Partial<CreateRemoteAppDto>,
  ) {
    return this.svc.updateRemoteApp(user.orgId, user.sub, workspaceId, id, dto);
  }

  @RequirePermissions('WORKSPACE_MANAGE')
  @Delete(':id')
  remove(
    @CurrentUser() user: AuthUser,
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
  ) {
    return this.svc.removeRemoteApp(user.orgId, user.sub, workspaceId, id);
  }
}
