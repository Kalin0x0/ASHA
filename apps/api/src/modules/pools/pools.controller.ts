import { Body, Controller, Delete, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  type CreatePoolDto,
  createPoolSchema,
  type UpdatePoolDto,
  updatePoolSchema,
  type UpsertAutoscaleDto,
  upsertAutoscaleSchema,
} from '@asha/contracts';
import { type AuthUser, CurrentUser, RequirePermissions } from '../../common/decorators';
import { ZodPipe } from '../../common/zod.pipe';
import { PoolsService } from './pools.service';

@ApiTags('pools')
@ApiBearerAuth()
@Controller('pools')
export class PoolsController {
  constructor(private readonly pools: PoolsService) {}

  @RequirePermissions('POOL_MANAGE')
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.pools.list(user.orgId);
  }

  @RequirePermissions('POOL_MANAGE')
  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(createPoolSchema)) dto: CreatePoolDto) {
    return this.pools.create(user.orgId, user.sub, dto);
  }

  @RequirePermissions('POOL_MANAGE')
  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(updatePoolSchema)) dto: UpdatePoolDto,
  ) {
    return this.pools.update(user.orgId, user.sub, id, dto);
  }

  @RequirePermissions('POOL_MANAGE')
  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.pools.remove(user.orgId, user.sub, id);
  }

  // ── Autoscale config ──────────────────────────────────────────────────────

  @RequirePermissions('AUTOSCALE_MANAGE')
  @Put(':id/autoscale')
  upsertAutoscale(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(upsertAutoscaleSchema)) dto: UpsertAutoscaleDto,
  ) {
    return this.pools.upsertAutoscale(user.orgId, user.sub, id, dto);
  }

  @RequirePermissions('AUTOSCALE_MANAGE')
  @Delete(':id/autoscale')
  removeAutoscale(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.pools.removeAutoscale(user.orgId, user.sub, id);
  }

  /** D5: the desired-capacity plan for this pool right now (schedule-evaluated). */
  @RequirePermissions('AUTOSCALE_MANAGE')
  @Get(':id/autoscale/plan')
  planAutoscale(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.pools.planAutoscale(user.orgId, id);
  }
}
