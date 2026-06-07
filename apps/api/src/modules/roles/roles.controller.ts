import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { type AuthUser, CurrentUser, RequirePermissions } from '../../common/decorators';
import { ZodPipe } from '../../common/zod.pipe';
import { RolesService } from './roles.service';

const roleSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(300).nullable().optional(),
  permissions: z.array(z.string()).optional(),
});
type RoleDto = z.infer<typeof roleSchema>;

const roleUpdateSchema = roleSchema.partial();
type RoleUpdateDto = z.infer<typeof roleUpdateSchema>;

@ApiTags('roles')
@ApiBearerAuth()
@Controller('roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  // Declared before ':id' so the literal path wins the route match.
  @RequirePermissions('ROLE_MANAGE')
  @Get('permissions')
  catalog() {
    return this.roles.catalog();
  }

  @RequirePermissions('ROLE_MANAGE')
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.roles.list(user);
  }

  @RequirePermissions('ROLE_MANAGE')
  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.roles.get(user, id);
  }

  @RequirePermissions('ROLE_MANAGE')
  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(roleSchema)) dto: RoleDto) {
    return this.roles.create(user, dto);
  }

  @RequirePermissions('ROLE_MANAGE')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(roleUpdateSchema)) dto: RoleUpdateDto,
  ) {
    return this.roles.update(user, id, dto);
  }

  @RequirePermissions('ROLE_MANAGE')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.roles.remove(user, id);
  }
}
