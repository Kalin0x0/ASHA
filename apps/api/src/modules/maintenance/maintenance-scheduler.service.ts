import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { prisma, runUnscoped } from '@asha/db';
import { MaintenanceExecutor, type MaintenanceTaskType } from './maintenance.executor';

export type ScheduleKind = 'INTERVAL' | 'DAILY' | 'WEEKLY';

/** Just the schedule fields needed to compute the next fire — keeps computeNext pure & testable. */
export interface Schedulable {
  scheduleKind: ScheduleKind;
  intervalMinutes: number | null;
  atMinuteOfDay: number | null;
  weekday: number | null;
}

function clampMinuteOfDay(v: number | null | undefined): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 0;
  return Math.min(1439, Math.max(0, Math.floor(v)));
}

/**
 * A single 30s tick drives every enabled MaintenanceTask: it runs any whose
 * `nextRunAt` has passed, then stamps the next fire. Persisting `nextRunAt` in
 * the DB (rather than registering live cron jobs) makes the scheduler
 * restart-safe and free of registry drift — minute-level precision, which is
 * all housekeeping needs. Each task is guarded against overlapping runs.
 */
@Injectable()
export class MaintenanceSchedulerService implements OnModuleInit {
  private readonly logger = new Logger('MaintenanceScheduler');
  private readonly running = new Set<string>();

  constructor(private readonly executor: MaintenanceExecutor) {}

  async onModuleInit(): Promise<void> {
    // Give any enabled task without a nextRunAt (fresh deploy / imported row) a
    // deterministic first fire so the tick can pick it up.
    await runUnscoped(async () => {
      const tasks = await prisma.maintenanceTask.findMany({ where: { enabled: true, nextRunAt: null } });
      for (const t of tasks) {
        await prisma.maintenanceTask.update({
          where: { id: t.id },
          data: { nextRunAt: this.computeNext(t, new Date()) },
        });
      }
    }).catch((e) => this.logger.warn(`init backfill failed: ${(e as Error).message}`));
  }

  @Interval('maintenance-tick', 30_000)
  async tick(): Promise<void> {
    const now = new Date();
    await runUnscoped(async () => {
      const due = await prisma.maintenanceTask.findMany({
        where: { enabled: true, OR: [{ nextRunAt: null }, { nextRunAt: { lte: now } }] },
        select: { id: true },
      });
      for (const { id } of due) {
        if (this.running.has(id)) continue;
        await this.runTask(id, 'SCHEDULE').catch((e) =>
          this.logger.error(`scheduled run of ${id} failed: ${(e as Error).message}`),
        );
      }
    }).catch((e) => this.logger.warn(`tick failed: ${(e as Error).message}`));
  }

  /**
   * Execute one task end-to-end: open a run row, run the handler, record the
   * outcome, and stamp the task's last-run + next-run. Always unscoped so a
   * MANUAL trigger from a request context has the same system-wide effect as a
   * scheduled run. No-ops if the task is already executing.
   */
  async runTask(
    taskId: string,
    trigger: 'SCHEDULE' | 'MANUAL',
    actorUserId?: string,
  ): Promise<{ run?: string; status: string; affected: number; summary: string } | { skipped: true }> {
    if (this.running.has(taskId)) return { skipped: true };
    this.running.add(taskId);
    try {
      return await runUnscoped(async () => {
        const task = await prisma.maintenanceTask.findUnique({ where: { id: taskId } });
        if (!task) return { skipped: true as const };

        const run = await prisma.maintenanceRun.create({
          data: {
            taskId: task.id,
            orgId: task.orgId,
            status: 'RUNNING',
            trigger,
            actorUserId: actorUserId ?? null,
          },
        });
        const startedMs = Date.now();
        try {
          const result = await this.executor.run(
            task.type as MaintenanceTaskType,
            (task.params ?? {}) as Record<string, unknown>,
          );
          const now = new Date();
          await prisma.maintenanceRun.update({
            where: { id: run.id },
            data: {
              status: result.status,
              finishedAt: now,
              durationMs: Date.now() - startedMs,
              summary: result.summary,
              affected: result.affected,
            },
          });
          await prisma.maintenanceTask.update({
            where: { id: task.id },
            data: {
              lastRunAt: now,
              lastStatus: result.status,
              lastSummary: result.summary,
              lastError: null,
              nextRunAt: this.computeNext(task, now),
              runCount: { increment: 1 },
            },
          });
          return { run: run.id, status: result.status, affected: result.affected, summary: result.summary };
        } catch (e) {
          const msg = (e as Error).message;
          const now = new Date();
          await prisma.maintenanceRun.update({
            where: { id: run.id },
            data: { status: 'FAILED', finishedAt: now, durationMs: Date.now() - startedMs, error: msg },
          });
          await prisma.maintenanceTask.update({
            where: { id: task.id },
            data: {
              lastRunAt: now,
              lastStatus: 'FAILED',
              lastError: msg,
              nextRunAt: this.computeNext(task, now),
              runCount: { increment: 1 },
            },
          });
          this.logger.error(`task ${task.type} failed: ${msg}`);
          return { run: run.id, status: 'FAILED', affected: 0, summary: msg };
        }
      });
    } finally {
      this.running.delete(taskId);
    }
  }

  /** Pure next-fire computation from the schedule fields (server-local time). */
  computeNext(task: Schedulable, from: Date): Date {
    if (task.scheduleKind === 'INTERVAL') {
      const mins = task.intervalMinutes && task.intervalMinutes > 0 ? task.intervalMinutes : 60;
      return new Date(from.getTime() + mins * 60_000);
    }
    const minuteOfDay = clampMinuteOfDay(task.atMinuteOfDay);
    const next = new Date(from);
    next.setHours(Math.floor(minuteOfDay / 60), minuteOfDay % 60, 0, 0);
    if (task.scheduleKind === 'DAILY') {
      if (next <= from) next.setDate(next.getDate() + 1);
      return next;
    }
    // WEEKLY: advance to the target weekday (0=Sun … 6=Sat) at the chosen time.
    const targetDow = (((task.weekday ?? 0) % 7) + 7) % 7;
    let delta = (targetDow - next.getDay() + 7) % 7;
    if (delta === 0 && next <= from) delta = 7;
    next.setDate(next.getDate() + delta);
    return next;
  }
}
