import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  type CreateServerDto,
  createServerSchema,
  type UpdateServerDto,
  updateServerSchema,
} from '@chista/contracts';
import { type AuthUser, CurrentUser, RequirePermissions } from '../../common/decorators';
import { ZodPipe } from '../../common/zod.pipe';
import { ServersService } from './servers.service';

@ApiTags('servers')
@ApiBearerAuth()
@Controller('servers')
export class ServersController {
  constructor(private readonly servers: ServersService) {}

  @RequirePermissions('SERVER_MANAGE')
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.servers.list(user.orgId);
  }

  @RequirePermissions('SERVER_MANAGE')
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(createServerSchema)) dto: CreateServerDto,
  ) {
    return this.servers.create(user.orgId, user.sub, dto);
  }

  /** Open a browser session against this fixed server (RDP/VNC/SSH via the proxy). */
  @RequirePermissions('SESSION_LAUNCH')
  @Post(':id/connect')
  connect(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.servers.connect(user, id);
  }

  /**
   * Download a `.rdp` file for the native Remote Desktop client (multi-monitor,
   * clipboard and local-drive access). Flags default to on; pass `0`/`false`
   * to disable. Returns `{ filename, content }`.
   */
  @RequirePermissions('SESSION_LAUNCH')
  @Get(':id/rdp-file')
  rdpFile(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('multimon') multimon?: string,
    @Query('clipboard') clipboard?: string,
    @Query('drives') drives?: string,
    @Query('printers') printers?: string,
  ) {
    const flag = (v: string | undefined) => (v === undefined ? undefined : v === '1' || v === 'true');
    return this.servers.rdpFile(user.orgId, user.sub, id, {
      multimon: flag(multimon),
      clipboard: flag(clipboard),
      drives: flag(drives),
      printers: flag(printers),
    });
  }

  @RequirePermissions('SERVER_MANAGE')
  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(updateServerSchema)) dto: UpdateServerDto,
  ) {
    return this.servers.update(user.orgId, user.sub, id, dto);
  }

  @RequirePermissions('SERVER_MANAGE')
  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.servers.remove(user.orgId, user.sub, id);
  }
}
