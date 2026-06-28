import { Controller, Delete, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { type AuthUser, CurrentUser, RequirePermissions } from '../../common/decorators';
import { RecordingsService } from './recordings.service';

@ApiTags('recordings')
@ApiBearerAuth()
@Controller('recordings')
export class RecordingsController {
  constructor(private readonly recordings: RecordingsService) {}

  @RequirePermissions('RECORDING_VIEW')
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.recordings.list(user.orgId);
  }

  @RequirePermissions('RECORDING_VIEW')
  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.recordings.get(user.orgId, id);
  }

  @RequirePermissions('RECORDING_VIEW')
  @Get(':id/playback')
  playback(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.recordings.playbackUrl(user.orgId, id);
  }

  @RequirePermissions('SESSION_TERMINATE_ANY')
  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.recordings.remove(user, id);
  }
}
