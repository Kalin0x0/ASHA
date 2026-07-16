import { Module } from '@nestjs/common';
import { SessionsModule } from '../sessions/sessions.module';
import { StagingController } from './staging.controller';
import { StagingReconcilerService } from './staging-reconciler.service';
import { StagingService } from './staging.service';

@Module({
  imports: [SessionsModule],
  controllers: [StagingController],
  providers: [StagingService, StagingReconcilerService],
})
export class StagingModule {}
