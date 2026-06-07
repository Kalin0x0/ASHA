import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { type AuthUser, CurrentUser, RequirePermissions } from '../../common/decorators';
import { ZodPipe } from '../../common/zod.pipe';
import { UsersService } from './users.service';

const createSchema = z.object({
  email: z.string().email(),
  username: z.string().min(1).max(64).optional(),
  displayName: z.string().max(120).optional(),
  password: z.string().min(8).max(200).optional(),
  isSystemAdmin: z.boolean().optional(),
  locale: z.string().max(10).optional(),
});
type CreateDto = z.infer<typeof createSchema>;

const updateSchema = z.object({
  username: z.string().min(1).max(64).optional(),
  displayName: z.string().max(120).nullable().optional(),
  locale: z.string().max(10).optional(),
  isSystemAdmin: z.boolean().optional(),
  status: z.enum(['ACTIVE', 'DISABLED', 'INVITED', 'LOCKED']).optional(),
  password: z.string().min(8).max(200).optional(),
});
type UpdateDto = z.infer<typeof updateSchema>;

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @RequirePermissions('USER_VIEW')
  @Get()
  list(@CurrentUser() user: AuthUser, @Query('q') q?: string) {
    return this.users.list(user, q);
  }

  @RequirePermissions('USER_VIEW')
  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.users.get(user, id);
  }

  @RequirePermissions('USER_CREATE')
  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(createSchema)) dto: CreateDto) {
    return this.users.create(user, dto);
  }

  @RequirePermissions('USER_EDIT')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(updateSchema)) dto: UpdateDto,
  ) {
    return this.users.update(user, id, dto);
  }

  @RequirePermissions('USER_DELETE')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.users.remove(user, id);
  }
}
