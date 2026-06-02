import { Body, Controller, Get, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  type ImportConfigDto,
  importConfigSchema,
  type UpsertBrandingDto,
  upsertBrandingSchema,
  type UpsertSettingsDto,
  upsertSettingsSchema,
} from '@chista/contracts';
import { type AuthUser, CurrentUser, RequirePermissions } from '../../common/decorators';
import { ZodPipe } from '../../common/zod.pipe';
import { SettingsService } from './settings.service';

@ApiTags('settings')
@ApiBearerAuth()
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @RequirePermissions('SETTINGS_MANAGE')
  @Get('general')
  listGeneral(@CurrentUser() user: AuthUser) {
    return this.settings.listGeneral(user.orgId);
  }

  @RequirePermissions('SETTINGS_MANAGE')
  @Put('general')
  upsertGeneral(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(upsertSettingsSchema)) dto: UpsertSettingsDto,
  ) {
    return this.settings.upsertGeneral(user.orgId, user.sub, dto);
  }

  @RequirePermissions('BRANDING_MANAGE')
  @Get('branding')
  getBranding(@CurrentUser() user: AuthUser) {
    return this.settings.getBranding(user.orgId);
  }

  @RequirePermissions('BRANDING_MANAGE')
  @Put('branding')
  upsertBranding(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(upsertBrandingSchema)) dto: UpsertBrandingDto,
  ) {
    return this.settings.upsertBranding(user.orgId, user.sub, dto);
  }

  @RequirePermissions('SETTINGS_MANAGE')
  @Get('config/export')
  exportConfig(@CurrentUser() user: AuthUser) {
    return this.settings.exportConfig(user.orgId);
  }

  @RequirePermissions('SETTINGS_MANAGE')
  @Post('config/import')
  importConfig(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(importConfigSchema)) dto: ImportConfigDto,
  ) {
    return this.settings.importConfig(user.orgId, user.sub, dto);
  }
}
