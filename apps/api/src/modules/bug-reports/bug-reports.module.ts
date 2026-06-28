import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AllExceptionsFilter } from '../../common/all-exceptions.filter';
import { BugReportsController } from './bug-reports.controller';
import { BugReportsService } from './bug-reports.service';

/**
 * Owns the bug-report intake/triage surface AND the global exception filter —
 * registering the filter here keeps it co-located with the service it depends
 * on, so unhandled crashes are captured into the same fix-memory pipeline.
 */
@Module({
  controllers: [BugReportsController],
  providers: [BugReportsService, { provide: APP_FILTER, useClass: AllExceptionsFilter }],
  exports: [BugReportsService],
})
export class BugReportsModule {}
