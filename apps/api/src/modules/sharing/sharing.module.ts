import { Module } from '@nestjs/common';
import { SessionsModule } from '../sessions/sessions.module';
import { SharingController } from './sharing.controller';
import { SharingService } from './sharing.service';

@Module({
  imports: [SessionsModule],
  controllers: [SharingController],
  providers: [SharingService],
})
export class SharingModule {}
