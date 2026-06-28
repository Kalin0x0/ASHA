import { Module } from '@nestjs/common';
import { LogForwardingController } from './log-forwarding.controller';
import { LogForwardingService } from './log-forwarding.service';

@Module({
  controllers: [LogForwardingController],
  providers: [LogForwardingService],
})
export class LogForwardingModule {}
