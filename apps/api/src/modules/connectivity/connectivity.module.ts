import { Module } from '@nestjs/common';
import { ConnectivityRenderService } from './connectivity-render.service';
import { ConnectivityController } from './connectivity.controller';
import { ConnectivityService } from './connectivity.service';

@Module({
  controllers: [ConnectivityController],
  providers: [ConnectivityService, ConnectivityRenderService],
})
export class ConnectivityModule {}
