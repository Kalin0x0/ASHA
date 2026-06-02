import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { type UpsertLicenseDto, upsertLicenseSchema } from '@chista/contracts';
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
  @Put()
  upsert(@CurrentUser() user: AuthUser, @Body(new ZodPipe(upsertLicenseSchema)) dto: UpsertLicenseDto) {
    return this.svc.upsert(user.orgId, user.sub, dto);
  }
}
