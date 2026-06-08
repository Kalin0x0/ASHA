import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { type AuthUser, CurrentUser, RequirePermissions } from '../../common/decorators';
import { ReportingService } from './reporting.service';

/** Parse an optional integer query param; non-numeric → undefined (service default applies). */
function intParam(v?: string): number | undefined {
  if (v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

@ApiTags('reporting')
@ApiBearerAuth()
@Controller('reporting')
export class ReportingController {
  constructor(private readonly reporting: ReportingService) {}

  @RequirePermissions('REPORTING_VIEW')
  @Get('summary')
  summary(@CurrentUser() user: AuthUser) {
    return this.reporting.summary(user.orgId);
  }

  /** FinOps cost report — runtime cost by user + workspace (rates overridable). */
  @RequirePermissions('REPORTING_VIEW')
  @Get('costs')
  costs(
    @CurrentUser() user: AuthUser,
    @Query('days') days?: string,
    @Query('coreHourCost') coreHourCost?: string,
    @Query('gbHourCost') gbHourCost?: string,
  ) {
    return this.reporting.costs(user.orgId, {
      days: intParam(days),
      coreHourCost: intParam(coreHourCost),
      gbHourCost: intParam(gbHourCost),
    });
  }

  @RequirePermissions('REPORTING_VIEW')
  @Get('sessions-over-time')
  sessionsOverTime(@CurrentUser() user: AuthUser, @Query('days') days?: string) {
    return this.reporting.sessionsOverTime(user.orgId, intParam(days));
  }

  @RequirePermissions('REPORTING_VIEW')
  @Get('top-workspaces')
  topWorkspaces(
    @CurrentUser() user: AuthUser,
    @Query('days') days?: string,
    @Query('limit') limit?: string,
  ) {
    return this.reporting.topWorkspaces(
      user.orgId,
      intParam(days),
      intParam(limit),
    );
  }

  @RequirePermissions('REPORTING_VIEW')
  @Get('metrics')
  metricSeries(
    @CurrentUser() user: AuthUser,
    @Query('metric') metric: string,
    @Query('hours') hours?: string,
  ) {
    return this.reporting.metricSeries(user.orgId, metric, intParam(hours));
  }

  @RequirePermissions('AUDIT_VIEW')
  @Get('audit-log')
  auditLog(
    @CurrentUser() user: AuthUser,
    @Query('limit') limit?: string,
    @Query('action') action?: string,
    @Query('actor') actor?: string,
    @Query('targetType') targetType?: string,
    @Query('since') since?: string,
    @Query('until') until?: string,
  ) {
    return this.reporting.auditLog(user.orgId, {
      limit: limit ? Number(limit) : undefined,
      action,
      actorUserId: actor,
      targetType,
      since,
      until,
    });
  }
}
