import { Module } from '@nestjs/common';
import { ZonesController } from './zones.controller';
import { ZonesService } from './zones.service';

@Module({
  controllers: [ZonesController],
  providers: [ZonesService],
})
export class ZonesModule {}
