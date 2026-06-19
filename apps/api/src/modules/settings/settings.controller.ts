import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  type ImportConfigDto,
  importConfigSchema,
  type UpsertBrandingDto,
  upsertBrandingSchema,
  type UpsertSettingsDto,
  upsertSettingsSchema,
} from '@asha/contracts';
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

  // ── Group-scoped branding + resolution (G3) ──────────────────────────────
  @RequirePermissions('BRANDING_MANAGE')
  @Get('branding/resolve')
  resolveBranding(@CurrentUser() user: AuthUser, @Query('groupId') groupId?: string) {
    return this.settings.resolveBranding(user.orgId, groupId);
  }

  @RequirePermissions('BRANDING_MANAGE')
  @Get('branding/group/:groupId')
  getGroupBranding(@CurrentUser() user: AuthUser, @Param('groupId') groupId: string) {
    return this.settings.getGroupBranding(user.orgId, groupId);
  }

  @RequirePermissions('BRANDING_MANAGE')
  @Put('branding/group/:groupId')
  upsertGroupBranding(
    @CurrentUser() user: AuthUser,
    @Param('groupId') groupId: string,
    @Body(new ZodPipe(upsertBrandingSchema)) dto: UpsertBrandingDto,
  ) {
    return this.settings.upsertGroupBranding(user.orgId, user.sub, groupId, dto);
  }

  @RequirePermissions('BRANDING_MANAGE')
  @Delete('branding/group/:groupId')
  removeGroupBranding(@CurrentUser() user: AuthUser, @Param('groupId') groupId: string) {
    return this.settings.removeGroupBranding(user.orgId, user.sub, groupId);
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
