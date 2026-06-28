import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Audit } from '../../common/audit.interceptor';
import { type AuthUser, CurrentUser, RequirePermissions } from '../../common/decorators';
import { ZodPipe } from '../../common/zod.pipe';
import { MaintenanceService } from './maintenance.service';

const taskType = z.enum([
  'REAP_DEAD_SESSIONS',
  'REAP_ABANDONED_SESSIONS',
  'PRUNE_DEAD_AGENTS',
  'RESTART_AGENTS',
  'RESTART_CONNECTION_PROXY',
  'PRUNE_AGENT_IMAGES',
]);
const scheduleKind = z.enum(['INTERVAL', 'DAILY', 'WEEKLY']);

const scheduleShape = {
  scheduleKind,
  intervalMinutes: z.number().int().min(1).max(43_200).optional(), // ≤ 30 days
  atMinuteOfDay: z.number().int().min(0).max(1439).optional(),
  weekday: z.number().int().min(0).max(6).optional(),
};

/** Each schedule kind requires its own fields — reject incomplete schedules early. */
function scheduleComplete(v: {
  scheduleKind: 'INTERVAL' | 'DAILY' | 'WEEKLY';
  intervalMinutes?: number;
  atMinuteOfDay?: number;
  weekday?: number;
}): boolean {
  if (v.scheduleKind === 'INTERVAL') return typeof v.intervalMinutes === 'number';
  if (v.scheduleKind === 'DAILY') return typeof v.atMinuteOfDay === 'number';
  return typeof v.atMinuteOfDay === 'number' && typeof v.weekday === 'number';
}

const createSchema = z
  .object({
    name: z.string().min(1).max(120),
    type: taskType,
    enabled: z.boolean().optional(),
    params: z.record(z.unknown()).optional(),
    ...scheduleShape,
  })
  .refine(scheduleComplete, {
    message: 'Schedule is incomplete: INTERVAL needs intervalMinutes, DAILY needs atMinuteOfDay, WEEKLY needs atMinuteOfDay + weekday',
  });
type CreateDto = z.infer<typeof createSchema>;

const updateSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    type: taskType.optional(),
    enabled: z.boolean().optional(),
    params: z.record(z.unknown()).optional(),
    scheduleKind: scheduleKind.optional(),
    intervalMinutes: z.number().int().min(1).max(43_200).optional(),
    atMinuteOfDay: z.number().int().min(0).max(1439).optional(),
    weekday: z.number().int().min(0).max(6).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field to update' });
type UpdateDto = z.infer<typeof updateSchema>;

@ApiTags('maintenance')
@ApiBearerAuth()
@RequirePermissions('MAINTENANCE_MANAGE')
@Controller('maintenance')
export class MaintenanceController {
  constructor(private readonly maintenance: MaintenanceService) {}

  /** The schedulable task catalog (static routes before :id). */
  @Get('catalog')
  catalog() {
    return this.maintenance.catalog();
  }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.maintenance.list(user);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.maintenance.get(user, id);
  }

  @Get(':id/runs')
  runs(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.maintenance.runs(user, id);
  }

  @Audit('maintenance.create', { targetType: 'MaintenanceTask' })
  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(createSchema)) dto: CreateDto) {
    return this.maintenance.create(user, dto);
  }

  @Audit('maintenance.update', { targetType: 'MaintenanceTask' })
  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body(new ZodPipe(updateSchema)) dto: UpdateDto) {
    return this.maintenance.update(user, id, dto);
  }

  @Audit('maintenance.delete', { targetType: 'MaintenanceTask' })
  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.maintenance.remove(user, id);
  }

  /** Trigger a task immediately, regardless of its schedule. */
  @Audit('maintenance.run', { targetType: 'MaintenanceTask' })
  @Post(':id/run')
  run(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.maintenance.runNow(user, id);
  }
}
