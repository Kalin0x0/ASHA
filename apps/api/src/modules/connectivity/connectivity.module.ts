import { Module } from '@nestjs/common';
import { ConnectivityController } from './connectivity.controller';
import { ConnectivityService } from './connectivity.service';

@Module({
  controllers: [ConnectivityController],
  providers: [ConnectivityService],
})
export class ConnectivityModule {}
