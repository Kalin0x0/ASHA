import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Audit } from '../../common/audit.interceptor';
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
  // License/access expiry (ISO datetime). Null/omitted = perpetual. When it
  // passes the account is auto-deactivated (sellable time-limited accounts).
  deactivatesAt: z.string().datetime().nullable().optional(),
});
type CreateDto = z.infer<typeof createSchema>;

const updateSchema = z.object({
  username: z.string().min(1).max(64).optional(),
  displayName: z.string().max(120).nullable().optional(),
  locale: z.string().max(10).optional(),
  isSystemAdmin: z.boolean().optional(),
  status: z.enum(['ACTIVE', 'DISABLED', 'INVITED', 'LOCKED']).optional(),
  password: z.string().min(8).max(200).optional(),
  // Set/extend (renew) or clear (null = perpetual) the license expiry.
  deactivatesAt: z.string().datetime().nullable().optional(),
});
type UpdateDto = z.infer<typeof updateSchema>;

const importSchema = z.object({ csv: z.string().min(1).max(1_000_000) });
type ImportDto = z.infer<typeof importSchema>;

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

  @Audit('user.create', { targetType: 'User' })
  @RequirePermissions('USER_CREATE')
  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(createSchema)) dto: CreateDto) {
    return this.users.create(user, dto);
  }

  /** Bulk-import users from a CSV (header row + rows). See UsersService.bulkImport. */
  @Audit('user.bulk_import', { targetType: 'User' })
  @RequirePermissions('USER_CREATE')
  @Post('import')
  bulkImport(@CurrentUser() user: AuthUser, @Body(new ZodPipe(importSchema)) dto: ImportDto) {
    return this.users.bulkImport(user, dto.csv);
  }

  @Audit('user.update', { targetType: 'User' })
  @RequirePermissions('USER_EDIT')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(updateSchema)) dto: UpdateDto,
  ) {
    return this.users.update(user, id, dto);
  }

  @Audit('user.delete', { targetType: 'User' })
  @RequirePermissions('USER_DELETE')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.users.remove(user, id);
  }
}
