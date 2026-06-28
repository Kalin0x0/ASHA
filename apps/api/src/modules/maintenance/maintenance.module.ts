import { Module } from '@nestjs/common';
import { SessionsModule } from '../sessions/sessions.module';
import { MaintenanceController } from './maintenance.controller';
import { MaintenanceExecutor } from './maintenance.executor';
import { MaintenanceSchedulerService } from './maintenance-scheduler.service';
import { MaintenanceService } from './maintenance.service';

/**
 * Admin-configurable maintenance/automation scheduler. Reuses the session
 * reaper (exported by SessionsModule) for cleanup tasks and publishes agent
 * commands (via the global RedisService) for restart/prune tasks.
 */
@Module({
  imports: [SessionsModule],
  controllers: [MaintenanceController],
  providers: [MaintenanceExecutor, MaintenanceSchedulerService, MaintenanceService],
})
export class MaintenanceModule {}
