import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  type CreateDNSProviderDto,
  createDNSProviderSchema,
  type CreateVMProviderDto,
  createVMProviderSchema,
  type UpdateProviderDto,
  updateProviderSchema,
} from '@chista/contracts';
import { type AuthUser, CurrentUser, RequirePermissions } from '../../common/decorators';
import { ZodPipe } from '../../common/zod.pipe';
import { ProvidersService } from './providers.service';

@ApiTags('providers')
@ApiBearerAuth()
@Controller('providers')
export class ProvidersController {
  constructor(private readonly providers: ProvidersService) {}

  // ── VM providers ──────────────────────────────────────────────────────────

  @RequirePermissions('PROVIDER_MANAGE')
  @Get('vm')
  listVM(@CurrentUser() user: AuthUser) {
    return this.providers.listVM(user.orgId);
  }

  @RequirePermissions('PROVIDER_MANAGE')
  @Post('vm')
  createVM(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(createVMProviderSchema)) dto: CreateVMProviderDto,
  ) {
    return this.providers.createVM(user.orgId, user.sub, dto);
  }

  @RequirePermissions('PROVIDER_MANAGE')
  @Patch('vm/:id')
  updateVM(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(updateProviderSchema)) dto: UpdateProviderDto,
  ) {
    return this.providers.updateVM(user.orgId, user.sub, id, dto);
  }

  @RequirePermissions('PROVIDER_MANAGE')
  @Delete('vm/:id')
  removeVM(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.providers.removeVM(user.orgId, user.sub, id);
  }

  // ── DNS providers ─────────────────────────────────────────────────────────

  @RequirePermissions('PROVIDER_MANAGE')
  @Get('dns')
  listDNS(@CurrentUser() user: AuthUser) {
    return this.providers.listDNS(user.orgId);
  }

  @RequirePermissions('PROVIDER_MANAGE')
  @Post('dns')
  createDNS(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(createDNSProviderSchema)) dto: CreateDNSProviderDto,
  ) {
    return this.providers.createDNS(user.orgId, user.sub, dto);
  }

  @RequirePermissions('PROVIDER_MANAGE')
  @Patch('dns/:id')
  updateDNS(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(updateProviderSchema)) dto: UpdateProviderDto,
  ) {
    return this.providers.updateDNS(user.orgId, user.sub, id, dto);
  }

  @RequirePermissions('PROVIDER_MANAGE')
  @Delete('dns/:id')
  removeDNS(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.providers.removeDNS(user.orgId, user.sub, id);
  }
}
