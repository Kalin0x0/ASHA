import { Module } from '@nestjs/common';
import { SessionsModule } from '../sessions/sessions.module';
import { ObservationController } from './observation.controller';
import { ObservationService } from './observation.service';

@Module({
  imports: [SessionsModule],
  controllers: [ObservationController],
  providers: [ObservationService],
})
export class ObservationModule {}
