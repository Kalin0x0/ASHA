import { Body, Controller, Delete, Get, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { type UpsertWatermarkDto, upsertWatermarkSchema } from '@chista/contracts';
import { type AuthUser, CurrentUser, RequirePermissions } from '../../common/decorators';
import { ZodPipe } from '../../common/zod.pipe';
import { WatermarksService } from './watermarks.service';

@ApiTags('watermarks')
@ApiBearerAuth()
@Controller('watermarks')
export class WatermarksController {
  constructor(private readonly svc: WatermarksService) {}

  @RequirePermissions('SETTINGS_MANAGE')
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.svc.list(user.orgId);
  }

  @RequirePermissions('SETTINGS_MANAGE')
  @Put()
  upsert(@CurrentUser() user: AuthUser, @Body(new ZodPipe(upsertWatermarkSchema)) dto: UpsertWatermarkDto) {
    return this.svc.upsert(user.orgId, user.sub, dto);
  }

  @RequirePermissions('SETTINGS_MANAGE')
  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.remove(user.orgId, user.sub, id);
  }
}
