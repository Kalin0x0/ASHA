import { Module } from '@nestjs/common';
import { ProvidersModule } from '../providers/providers.module';
import { AutoscaleRunnerService } from './autoscale-runner.service';
import { PoolsController } from './pools.controller';
import { PoolsService } from './pools.service';

@Module({
  imports: [ProvidersModule],
  controllers: [PoolsController],
  providers: [PoolsService, AutoscaleRunnerService],
})
export class PoolsModule {}
