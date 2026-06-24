import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from '@asha/db';
import type { AuthUser } from '../../common/decorators';
import { MAINTENANCE_CATALOG, type MaintenanceTaskType } from './maintenance.executor';
import { MaintenanceSchedulerService, type ScheduleKind } from './maintenance-scheduler.service';

export interface CreateTaskInput {
  name: string;
  type: MaintenanceTaskType;
  enabled?: boolean;
  scheduleKind: ScheduleKind;
  intervalMinutes?: number;
  atMinuteOfDay?: number;
  weekday?: number;
  params?: Record<string, unknown>;
}

export type UpdateTaskInput = Partial<CreateTaskInput>;

/**
 * CRUD over MaintenanceTask rows plus run history and manual "run now". Tasks
 * carry an `orgId` for ownership/RBAC; every query is filtered on the caller's
 * org. (MaintenanceTask/Run are intentionally NOT in the tenant auto-scope set,
 * so the orgId filter is explicit here — mirroring BugReports.)
 */
@Injectable()
export class MaintenanceService {
  constructor(private readonly scheduler: MaintenanceSchedulerService) {}

  catalog() {
    return MAINTENANCE_CATALOG;
  }

  list(user: AuthUser) {
    return prisma.maintenanceTask.findMany({
      where: { orgId: user.orgId },
      orderBy: [{ enabled: 'desc' }, { createdAt: 'asc' }],
      include: { runs: { orderBy: { startedAt: 'desc' }, take: 1 } },
    });
  }

  async get(user: AuthUser, id: string) {
    const task = await prisma.maintenanceTask.findFirst({
      where: { id, orgId: user.orgId },
      include: { runs: { orderBy: { startedAt: 'desc' }, take: 20 } },
    });
    if (!task) throw new NotFoundException('Maintenance task not found');
    return task;
  }

  async runs(user: AuthUser, id: string) {
    await this.ensureOwned(user, id);
    return prisma.maintenanceRun.findMany({
      where: { taskId: id },
      orderBy: { startedAt: 'desc' },
      take: 50,
    });
  }

  async create(user: AuthUser, dto: CreateTaskInput) {
    const task = await prisma.maintenanceTask.create({
      data: {
        orgId: user.orgId,
        createdById: user.sub,
        name: dto.name,
        type: dto.type,
        enabled: dto.enabled ?? true,
        scheduleKind: dto.scheduleKind,
        intervalMinutes: dto.intervalMinutes ?? null,
        atMinuteOfDay: dto.atMinuteOfDay ?? null,
        weekday: dto.weekday ?? null,
        params: (dto.params ?? {}) as object,
      },
    });
    // Stamp the first fire time so the tick schedules it deterministically.
    await prisma.maintenanceTask.update({
      where: { id: task.id },
      data: { nextRunAt: task.enabled ? this.scheduler.computeNext(task, new Date()) : null },
    });
    return this.get(user, task.id);
  }

  async update(user: AuthUser, id: string, dto: UpdateTaskInput) {
    const existing = await prisma.maintenanceTask.findFirst({ where: { id, orgId: user.orgId } });
    if (!existing) throw new NotFoundException('Maintenance task not found');
    const merged = { ...existing, ...dto };
    const enabled = dto.enabled ?? existing.enabled;
    await prisma.maintenanceTask.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
        ...(dto.scheduleKind !== undefined ? { scheduleKind: dto.scheduleKind } : {}),
        ...(dto.intervalMinutes !== undefined ? { intervalMinutes: dto.intervalMinutes } : {}),
        ...(dto.atMinuteOfDay !== undefined ? { atMinuteOfDay: dto.atMinuteOfDay } : {}),
        ...(dto.weekday !== undefined ? { weekday: dto.weekday } : {}),
        ...(dto.params !== undefined ? { params: dto.params as object } : {}),
        // Re-arm the schedule on any change; disabling clears the next fire.
        nextRunAt: enabled ? this.scheduler.computeNext(merged, new Date()) : null,
      },
    });
    return this.get(user, id);
  }

  async remove(user: AuthUser, id: string) {
    await this.ensureOwned(user, id);
    await prisma.maintenanceTask.delete({ where: { id } });
    return { ok: true };
  }

  async runNow(user: AuthUser, id: string) {
    await this.ensureOwned(user, id);
    return this.scheduler.runTask(id, 'MANUAL', user.sub);
  }

  private async ensureOwned(user: AuthUser, id: string) {
    const task = await prisma.maintenanceTask.findFirst({ where: { id, orgId: user.orgId }, select: { id: true } });
    if (!task) throw new NotFoundException('Maintenance task not found');
  }
}
