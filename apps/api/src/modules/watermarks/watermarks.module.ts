import { Module } from '@nestjs/common';
import { WatermarksController } from './watermarks.controller';
import { WatermarksService } from './watermarks.service';

@Module({
  controllers: [WatermarksController],
  providers: [WatermarksService],
  exports: [WatermarksService],
})
export class WatermarksModule {}
