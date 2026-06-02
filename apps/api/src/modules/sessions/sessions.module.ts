import { Module } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { SessionsController } from './sessions.controller';
import { SessionsGateway } from './sessions.gateway';
import { SessionsService } from './sessions.service';

@Module({
  controllers: [SessionsController],
  providers: [SessionsService, SchedulerService, SessionsGateway],
  exports: [SessionsGateway, SessionsService],
})
export class SessionsModule {}
