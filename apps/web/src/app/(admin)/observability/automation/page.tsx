'use client';

import {
  CalendarClock,
  ChevronDown,
  Pencil,
  Play,
  Plus,
  RotateCw,
  Trash2,
  Wrench,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { MaintenanceTaskDialog } from '@/components/composite/maintenance-task-dialog';
import { EmptyState } from '@/components/composite/empty-state';
import { PageHeader } from '@/components/composite/page-header';
import { StatCard } from '@/components/composite/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useConfirm } from '@/components/ui/confirm';
import {
  useDeleteMaintenanceTask,
  useMaintenanceRuns,
  useMaintenanceTasks,
  useRunMaintenanceTask,
  useUpdateMaintenanceTask,
} from '@/lib/hooks';
import type { MaintenanceRunStatus, MaintenanceTaskRow, MaintenanceTaskType } from '@/lib/types';
import { cn } from '@/lib/utils';

const CLEANUP_TYPES: MaintenanceTaskType[] = [
  'REAP_DEAD_SESSIONS',
  'REAP_ABANDONED_SESSIONS',
  'PRUNE_DEAD_AGENTS',
];

const runVariant: Record<MaintenanceRunStatus, 'success' | 'destructive' | 'info' | 'outline'> = {
  OK: 'success',
  FAILED: 'destructive',
  RUNNING: 'info',
  SKIPPED: 'outline',
};

function useRelTime() {
  const locale = useLocale();
  return (iso: string | null): string | null => {
    if (!iso) return null;
    const diff = new Date(iso).getTime() - Date.now();
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    const abs = Math.abs(diff);
    const min = 60_000;
    const hour = 60 * min;
    const day = 24 * hour;
    if (abs < hour) return rtf.format(Math.round(diff / min), 'minute');
    if (abs < day) return rtf.format(Math.round(diff / hour), 'hour');
    return rtf.format(Math.round(diff / day), 'day');
  };
}

export default function AutomationPage() {
  const t = useTranslations('automation');
  const tasks = useMaintenanceTasks();
  const [dialog, setDialog] = useState<{ open: boolean; task: MaintenanceTaskRow | null }>({
    open: false,
    task: null,
  });

  const stats = useMemo(() => {
    const cleanup = tasks.filter((x) => CLEANUP_TYPES.includes(x.type)).length;
    return {
      active: tasks.filter((x) => x.enabled).length,
      cleanup,
      restart: tasks.length - cleanup,
      runs: tasks.reduce((sum, x) => sum + x.runCount, 0),
    };
  }, [tasks]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('page.title')}
        description={t('page.description')}
        actions={
          <Button onClick={() => setDialog({ open: true, task: null })}>
            <Plus className="size-4" /> {t('page.new')}
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label={t('stats.active')} value={stats.active} icon={CalendarClock} primary />
        <StatCard label={t('stats.cleanup')} value={stats.cleanup} icon={Wrench} tone="info" />
        <StatCard label={t('stats.restart')} value={stats.restart} icon={RotateCw} tone="warning" />
        <StatCard label={t('stats.lastRun')} value={stats.runs} icon={Play} tone="success" />
      </div>

      <Card elevation={1} className="overflow-hidden">
        {tasks.length === 0 ? (
          <EmptyState icon={CalendarClock} title={t('empty.title')} description={t('empty.description')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-start text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-5 py-3 text-start font-medium">{t('table.task')}</th>
                  <th className="hidden px-5 py-3 text-start font-medium md:table-cell">{t('table.schedule')}</th>
                  <th className="hidden px-5 py-3 text-start font-medium lg:table-cell">{t('table.lastRun')}</th>
                  <th className="hidden px-5 py-3 text-start font-medium lg:table-cell">{t('table.nextRun')}</th>
                  <th className="px-5 py-3 text-end font-medium">{t('table.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => (
                  <TaskRow key={task.id} task={task} onEdit={() => setDialog({ open: true, task })} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <MaintenanceTaskDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        task={dialog.task}
      />
    </div>
  );
}

function TaskRow({ task, onEdit }: { task: MaintenanceTaskRow; onEdit: () => void }) {
  const t = useTranslations('automation');
  const rel = useRelTime();
  const confirm = useConfirm();
  const run = useRunMaintenanceTask();
  const update = useUpdateMaintenanceTask();
  const remove = useDeleteMaintenanceTask();
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const runs = useMaintenanceRuns(expanded ? task.id : '');

  const isCleanup = CLEANUP_TYPES.includes(task.type);

  const scheduleLabel = () => {
    if (task.scheduleKind === 'INTERVAL') {
      const m = task.intervalMinutes ?? 60;
      return m % 60 === 0 ? t('schedule.everyHours', { n: m / 60 }) : t('schedule.everyMinutes', { n: m });
    }
    const time = minToTime(task.atMinuteOfDay ?? 0);
    if (task.scheduleKind === 'DAILY') return t('schedule.dailyAt', { time });
    return t('schedule.weeklyAt', { day: t(`weekdaysShort.${task.weekday ?? 0}`), time });
  };

  const onRun = async () => {
    setBusy(true);
    try {
      const res = await run(task.id);
      const summary = res && 'summary' in res ? res.summary : undefined;
      toast.success(t('toast.ran'), { description: summary });
    } catch {
      toast.error(t('toast.error'));
    } finally {
      setBusy(false);
    }
  };

  const onToggle = async () => {
    try {
      await update(task.id, { enabled: !task.enabled });
      toast.success(t('toast.updated'));
    } catch {
      toast.error(t('toast.error'));
    }
  };

  const onDelete = async () => {
    const ok = await confirm({
      title: t('actions.confirmDelete'),
      description: t('actions.confirmDeleteHint'),
      confirmLabel: t('actions.delete'),
    });
    if (!ok) return;
    try {
      await remove(task.id);
      toast.success(t('toast.deleted'));
    } catch {
      toast.error(t('toast.error'));
    }
  };

  return (
    <>
      <tr className="border-b border-border-subtle/60 align-middle transition-colors last:border-0 hover:bg-secondary/40">
        <td className="px-5 py-3">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="group flex items-center gap-2 text-start ring-gold-focus"
            aria-expanded={expanded}
          >
            <ChevronDown
              className={cn(
                'size-4 shrink-0 text-muted-foreground transition-transform',
                expanded && 'rotate-180',
              )}
            />
            <span className="min-w-0">
              <span className="flex items-center gap-2">
                <span className="truncate font-medium text-foreground">{task.name}</span>
                {!task.enabled && (
                  <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                    {t('status.disabled')}
                  </Badge>
                )}
              </span>
              <span className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                <Badge variant={isCleanup ? 'info' : 'warning'} className="px-1.5 py-0">
                  {t(`categories.${isCleanup ? 'CLEANUP' : 'RESTART'}`)}
                </Badge>
                <span className="truncate">{t(`types.${task.type}.label`)}</span>
              </span>
            </span>
          </button>
        </td>

        <td className="hidden whitespace-nowrap px-5 py-3 text-muted-foreground md:table-cell">
          {scheduleLabel()}
        </td>

        <td className="hidden whitespace-nowrap px-5 py-3 lg:table-cell">
          {task.lastStatus ? (
            <span className="flex items-center gap-2">
              <Badge variant={runVariant[task.lastStatus]}>{t(`status.${task.lastStatus}`)}</Badge>
              <span className="text-xs text-muted-foreground">{rel(task.lastRunAt)}</span>
            </span>
          ) : (
            <span className="text-xs text-muted-foreground/70">{t('status.never')}</span>
          )}
        </td>

        <td className="hidden whitespace-nowrap px-5 py-3 text-muted-foreground lg:table-cell">
          {task.enabled ? (rel(task.nextRunAt) ?? '—') : <span className="text-muted-foreground/60">—</span>}
        </td>

        <td className="px-5 py-3">
          <div className="flex items-center justify-end gap-1">
            <Button variant="ghost" size="sm" onClick={onRun} loading={busy} aria-label={t('actions.runNow')}>
              <Play className="size-4" />
              <span className="hidden sm:inline">{t('actions.runNow')}</span>
            </Button>
            <button
              type="button"
              role="switch"
              aria-checked={task.enabled}
              aria-label={task.enabled ? t('actions.disable') : t('actions.enable')}
              onClick={onToggle}
              className={cn(
                'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ring-gold-focus',
                task.enabled ? 'bg-gold-500/80' : 'bg-secondary',
              )}
            >
              <span
                className={cn(
                  'inline-block size-5 transform rounded-full bg-white shadow transition-transform',
                  task.enabled ? 'translate-x-5' : 'translate-x-0.5',
                )}
              />
            </button>
            <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label={t('actions.edit')}>
              <Pencil className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onDelete}
              aria-label={t('actions.delete')}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </td>
      </tr>

      {expanded && (
        <tr className="border-b border-border-subtle/60 bg-[var(--surface-1)]/40">
          <td colSpan={5} className="px-5 py-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {t('runs.title')}
            </p>
            {runs.length === 0 ? (
              <p className="text-sm text-muted-foreground/70">{t('runs.empty')}</p>
            ) : (
              <ul className="space-y-1.5">
                {runs.map((r) => (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border-subtle/60 bg-background/40 px-3 py-2 text-sm"
                  >
                    <Badge variant={runVariant[r.status]} className="px-1.5 py-0">
                      {t(`status.${r.status}`)}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{rel(r.startedAt)}</span>
                    <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                      {r.trigger === 'MANUAL' ? t('runs.manual') : t('runs.scheduled')}
                    </Badge>
                    {typeof r.durationMs === 'number' && (
                      <span className="tnum text-xs text-muted-foreground/70">{r.durationMs} ms</span>
                    )}
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">
                      {r.error ?? r.summary ?? ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

const minToTime = (m: number) => {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
};
