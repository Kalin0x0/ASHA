import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  type CreateRegistryDto,
  createRegistrySchema,
  type InstallRegistryEntryDto,
  installRegistryEntrySchema,
  type UpdateRegistryDto,
  updateRegistrySchema,
} from '@chista/contracts';
import { type AuthUser, CurrentUser, RequirePermissions } from '../../common/decorators';
import { ZodPipe } from '../../common/zod.pipe';
import { RegistryService } from './registry.service';

@ApiTags('registry')
@ApiBearerAuth()
@Controller()
export class RegistryController {
  constructor(private readonly svc: RegistryService) {}

  // ── Registries ────────────────────────────────────────────────────────────
  @RequirePermissions('REGISTRY_MANAGE')
  @Get('registries')
  list(@CurrentUser() user: AuthUser) {
    return this.svc.listRegistries(user.orgId);
  }

  @RequirePermissions('REGISTRY_MANAGE')
  @Post('registries')
  create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(createRegistrySchema)) dto: CreateRegistryDto) {
    return this.svc.createRegistry(user.orgId, user.sub, dto);
  }

  @RequirePermissions('REGISTRY_MANAGE')
  @Patch('registries/:id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(updateRegistrySchema)) dto: UpdateRegistryDto,
  ) {
    return this.svc.updateRegistry(user.orgId, user.sub, id, dto);
  }

  @RequirePermissions('REGISTRY_MANAGE')
  @Delete('registries/:id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.removeRegistry(user.orgId, user.sub, id);
  }

  @RequirePermissions('REGISTRY_MANAGE')
  @Post('registries/:id/sync')
  sync(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.syncRegistry(user.orgId, user.sub, id);
  }

  // ── Marketplace ───────────────────────────────────────────────────────────
  @RequirePermissions('WORKSPACE_VIEW')
  @Get('marketplace')
  marketplace(@CurrentUser() user: AuthUser, @Query('q') q?: string) {
    return this.svc.marketplace(user.orgId, q);
  }

  @RequirePermissions('WORKSPACE_VIEW')
  @Get('marketplace/:entryId/preview')
  preview(@CurrentUser() user: AuthUser, @Param('entryId') entryId: string) {
    return this.svc.preview(user.orgId, entryId);
  }

  @RequirePermissions('IMAGE_MANAGE')
  @Post('marketplace/:entryId/install')
  install(
    @CurrentUser() user: AuthUser,
    @Param('entryId') entryId: string,
    @Body(new ZodPipe(installRegistryEntrySchema)) dto: InstallRegistryEntryDto,
  ) {
    return this.svc.install(user.orgId, user.sub, entryId, dto);
  }
}
