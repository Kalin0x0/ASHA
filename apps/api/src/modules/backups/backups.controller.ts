import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { SystemAdminGuard } from '../../common/system-admin.guard';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators';
import { BackupsService } from './backups.service';

@ApiTags('backups')
@ApiBearerAuth()
@Controller('backups')
@UseGuards(SystemAdminGuard)
export class BackupsController {
  constructor(private readonly svc: BackupsService) {}

  @RequirePermissions('SETTINGS_MANAGE')
  @Get()
  list() {
    return this.svc.list();
  }

  @RequirePermissions('SETTINGS_MANAGE')
  @Post('run')
  run() {
    return this.svc.runBackup();
  }
}
