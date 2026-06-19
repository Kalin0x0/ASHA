import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  type CreateStagingDto,
  createStagingSchema,
  type UpdateStagingDto,
  updateStagingSchema,
} from '@asha/contracts';
import { type AuthUser, CurrentUser, RequirePermissions } from '../../common/decorators';
import { ZodPipe } from '../../common/zod.pipe';
import { StagingService } from './staging.service';

@ApiTags('staging')
@ApiBearerAuth()
@Controller('staging')
export class StagingController {
  constructor(private readonly staging: StagingService) {}

  @RequirePermissions('POOL_MANAGE')
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.staging.list(user.orgId);
  }

  @RequirePermissions('POOL_MANAGE')
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(createStagingSchema)) dto: CreateStagingDto,
  ) {
    return this.staging.create(user.orgId, user.sub, dto);
  }

  @RequirePermissions('POOL_MANAGE')
  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(updateStagingSchema)) dto: UpdateStagingDto,
  ) {
    return this.staging.update(user.orgId, user.sub, id, dto);
  }

  @RequirePermissions('POOL_MANAGE')
  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.staging.remove(user.orgId, user.sub, id);
  }
}
