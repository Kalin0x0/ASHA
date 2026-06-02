import { Module } from '@nestjs/common';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { SchedulerService } from './scheduler.service';
import { SessionReaperService } from './session-reaper.service';
import { SessionsController } from './sessions.controller';
import { SessionsGateway } from './sessions.gateway';
import { SessionsService } from './sessions.service';

@Module({
  imports: [WebhooksModule],
  controllers: [SessionsController],
  providers: [SessionsService, SchedulerService, SessionsGateway, SessionReaperService],
  exports: [SessionsGateway, SessionsService],
})
export class SessionsModule {}
