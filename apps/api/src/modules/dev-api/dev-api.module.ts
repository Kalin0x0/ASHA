import { Module } from '@nestjs/common';
import { ApiKeyGuard } from '../../common/api-key.guard';
import { SessionsModule } from '../sessions/sessions.module';
import { DevApiController } from './dev-api.controller';

@Module({
  imports: [SessionsModule],
  controllers: [DevApiController],
  providers: [ApiKeyGuard],
})
export class DevApiModule {}
