import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  type CreateCastingDto,
  createCastingSchema,
  type UpdateCastingDto,
  updateCastingSchema,
} from '@asha/contracts';
import { type AuthUser, CurrentUser, RequirePermissions } from '../../common/decorators';
import { ZodPipe } from '../../common/zod.pipe';
import { CastingService } from './casting.service';

@ApiTags('casting')
@ApiBearerAuth()
@Controller('casting')
export class CastingController {
  constructor(private readonly casting: CastingService) {}

  @RequirePermissions('WORKSPACE_EDIT')
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.casting.list(user.orgId);
  }

  @RequirePermissions('WORKSPACE_EDIT')
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(createCastingSchema)) dto: CreateCastingDto,
  ) {
    return this.casting.create(user.orgId, user.sub, dto);
  }

  @RequirePermissions('WORKSPACE_EDIT')
  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(updateCastingSchema)) dto: UpdateCastingDto,
  ) {
    return this.casting.update(user.orgId, user.sub, id, dto);
  }

  @RequirePermissions('WORKSPACE_EDIT')
  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.casting.remove(user.orgId, user.sub, id);
  }
}
