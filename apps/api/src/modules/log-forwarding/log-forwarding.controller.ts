import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  type UpdateLogForwarderDto,
  updateLogForwarderSchema,
  type UpsertLogForwarderDto,
  upsertLogForwarderSchema,
} from '@chista/contracts';
import { type AuthUser, CurrentUser, RequirePermissions } from '../../common/decorators';
import { ZodPipe } from '../../common/zod.pipe';
import { LogForwardingService } from './log-forwarding.service';

@ApiTags('log-forwarding')
@ApiBearerAuth()
@Controller('log-forwarders')
export class LogForwardingController {
  constructor(private readonly svc: LogForwardingService) {}

  @RequirePermissions('SETTINGS_MANAGE')
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.svc.list(user.orgId);
  }

  @RequirePermissions('SETTINGS_MANAGE')
  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(upsertLogForwarderSchema)) dto: UpsertLogForwarderDto) {
    return this.svc.create(user.orgId, user.sub, dto);
  }

  @RequirePermissions('SETTINGS_MANAGE')
  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(updateLogForwarderSchema)) dto: UpdateLogForwarderDto,
  ) {
    return this.svc.update(user.orgId, user.sub, id, dto);
  }

  @RequirePermissions('SETTINGS_MANAGE')
  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.remove(user.orgId, user.sub, id);
  }

  @RequirePermissions('SETTINGS_MANAGE')
  @Get(':id/fluent-bit-config')
  renderConfig(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.renderFluentBitConfig(user.orgId, id);
  }
}
