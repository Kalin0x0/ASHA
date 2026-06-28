import { Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators';
import { BackupsService } from './backups.service';

@ApiTags('backups')
@ApiBearerAuth()
@Controller('backups')
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
