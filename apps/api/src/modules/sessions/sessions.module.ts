import { Module } from '@nestjs/common';
import { ConnectivityModule } from '../connectivity/connectivity.module';
import { LicensingModule } from '../licensing/licensing.module';
import { ServersModule } from '../servers/servers.module';
import { StorageModule } from '../storage/storage.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { SchedulerService } from './scheduler.service';
import { SessionReaperService } from './session-reaper.service';
import { SessionsController } from './sessions.controller';
import { SessionsGateway } from './sessions.gateway';
import { SessionsService } from './sessions.service';

@Module({
  imports: [ConnectivityModule, WebhooksModule, LicensingModule, StorageModule, ServersModule],
  controllers: [SessionsController],
  providers: [SessionsService, SchedulerService, SessionsGateway, SessionReaperService],
  exports: [SessionsGateway, SessionsService, SessionReaperService],
})
export class SessionsModule {}
