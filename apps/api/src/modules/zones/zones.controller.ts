import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  type CreateZoneDto,
  createZoneSchema,
  type UpdateZoneDto,
  updateZoneSchema,
} from '@asha/contracts';
import { type AuthUser, CurrentUser, RequirePermissions } from '../../common/decorators';
import { ZodPipe } from '../../common/zod.pipe';
import { ZonesService } from './zones.service';

@ApiTags('zones')
@ApiBearerAuth()
@Controller('zones')
export class ZonesController {
  constructor(private readonly zones: ZonesService) {}

  @RequirePermissions('ZONE_MANAGE')
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.zones.list(user.orgId);
  }

  @RequirePermissions('ZONE_MANAGE')
  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(createZoneSchema)) dto: CreateZoneDto) {
    return this.zones.create(user.orgId, user.sub, dto);
  }

  @RequirePermissions('ZONE_MANAGE')
  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(updateZoneSchema)) dto: UpdateZoneDto,
  ) {
    return this.zones.update(user.orgId, user.sub, id, dto);
  }

  @RequirePermissions('ZONE_MANAGE')
  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.zones.remove(user.orgId, user.sub, id);
  }
}
