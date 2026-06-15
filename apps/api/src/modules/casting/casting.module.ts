import { Module } from '@nestjs/common';
import { CastingController } from './casting.controller';
import { CastingService } from './casting.service';

@Module({
  controllers: [CastingController],
  providers: [CastingService],
})
export class CastingModule {}
