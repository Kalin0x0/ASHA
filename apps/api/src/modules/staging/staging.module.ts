import { Module } from '@nestjs/common';
import { StagingController } from './staging.controller';
import { StagingService } from './staging.service';

@Module({
  controllers: [StagingController],
  providers: [StagingService],
})
export class StagingModule {}
