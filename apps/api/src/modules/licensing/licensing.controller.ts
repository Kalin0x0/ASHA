import { Body, Controller, Get, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  type ActivateLicenseDto,
  activateLicenseSchema,
  type UpsertLicenseDto,
  upsertLicenseSchema,
} from '@chista/contracts';
import { type AuthUser, CurrentUser, RequirePermissions } from '../../common/decorators';
import { ZodPipe } from '../../common/zod.pipe';
import { LicensingService } from './licensing.service';

@ApiTags('licensing')
@ApiBearerAuth()
@Controller('license')
export class LicensingController {
  constructor(private readonly svc: LicensingService) {}

  @RequirePermissions('LICENSE_MANAGE')
  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.svc.get(user.orgId);
  }

  @RequirePermissions('LICENSE_MANAGE')
  @Get('usage')
  usage(@CurrentUser() user: AuthUser) {
    return this.svc.usage(user.orgId);
  }

  @RequirePermissions('LICENSE_MANAGE')
  @Get('installation-id')
  installationId(@CurrentUser() user: AuthUser) {
    return { installationId: this.svc.installationId(user.orgId) };
  }

  @RequirePermissions('LICENSE_MANAGE')
  @Put()
  upsert(@CurrentUser() user: AuthUser, @Body(new ZodPipe(upsertLicenseSchema)) dto: UpsertLicenseDto) {
    return this.svc.upsert(user.orgId, user.sub, dto);
  }

  /** Activate an Ed25519-signed offline license key. */
  @RequirePermissions('LICENSE_MANAGE')
  @Post('activate')
  activate(@CurrentUser() user: AuthUser, @Body(new ZodPipe(activateLicenseSchema)) dto: ActivateLicenseDto) {
    return this.svc.activate(user.orgId, user.sub, dto.licenseKey);
  }
}
