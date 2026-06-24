'use client';

import { Save } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, Label } from '@/components/ui/input';
import { useCreateMaintenanceTask, useUpdateMaintenanceTask } from '@/lib/hooks';
import type {
  MaintenanceTaskInput,
  MaintenanceTaskRow,
  MaintenanceTaskType,
  ScheduleKind,
} from '@/lib/types';
import { cn } from '@/lib/utils';

const TASK_TYPES: MaintenanceTaskType[] = [
  'REAP_DEAD_SESSIONS',
  'REAP_ABANDONED_SESSIONS',
  'PRUNE_DEAD_AGENTS',
  'RESTART_AGENTS',
  'RESTART_CONNECTION_PROXY',
  'PRUNE_AGENT_IMAGES',
];
const SCHEDULE_KINDS: ScheduleKind[] = ['INTERVAL', 'DAILY', 'WEEKLY'];
const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

const fieldClass =
  'flex h-9.5 w-full rounded-md border border-input bg-[var(--surface-1)] px-3 text-sm focus-visible:border-[rgba(212,175,55,0.5)] focus-visible:shadow-[var(--gold-glow)] focus-visible:outline-none';

const minToTime = (m: number) => {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
};
const timeToMin = (t: string) => {
  const [hStr = '0', mStr = '0'] = t.split(':');
  const h = Number.parseInt(hStr, 10);
  const m = Number.parseInt(mStr, 10);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
};

export function MaintenanceTaskDialog({
  open,
  onOpenChange,
  task,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present ⇒ edit mode; absent ⇒ create mode. */
  task?: MaintenanceTaskRow | null;
}) {
  const t = useTranslations('automation');
  const tc = useTranslations('common');
  const create = useCreateMaintenanceTask();
  const update = useUpdateMaintenanceTask();

  const editing = Boolean(task);
  const [name, setName] = useState('');
  const [type, setType] = useState<MaintenanceTaskType>('REAP_DEAD_SESSIONS');
  const [scheduleKind, setScheduleKind] = useState<ScheduleKind>('DAILY');
  const [intervalMinutes, setIntervalMinutes] = useState(60);
  const [time, setTime] = useState('03:00');
  const [weekday, setWeekday] = useState(1);
  const [enabled, setEnabled] = useState(true);
  const [busy, setBusy] = useState(false);

  // Hydrate from the task being edited each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setName(task?.name ?? '');
    setType(task?.type ?? 'REAP_DEAD_SESSIONS');
    setScheduleKind(task?.scheduleKind ?? 'DAILY');
    setIntervalMinutes(task?.intervalMinutes ?? 60);
    setTime(minToTime(task?.atMinuteOfDay ?? 180));
    setWeekday(task?.weekday ?? 1);
    setEnabled(task?.enabled ?? true);
  }, [open, task]);

  const valid =
    name.trim().length > 0 && (scheduleKind !== 'INTERVAL' || intervalMinutes >= 1);

  const onSubmit = async () => {
    if (!valid) return;
    setBusy(true);
    const payload: MaintenanceTaskInput = {
      name: name.trim(),
      type,
      enabled,
      scheduleKind,
      ...(scheduleKind === 'INTERVAL'
        ? { intervalMinutes: Math.max(1, Math.floor(intervalMinutes)) }
        : { atMinuteOfDay: timeToMin(time) }),
      ...(scheduleKind === 'WEEKLY' ? { weekday } : {}),
    };
    try {
      if (task) await update(task.id, payload);
      else await create(payload);
      toast.success(editing ? t('toast.updated') : t('toast.created'));
      onOpenChange(false);
    } catch {
      toast.error(t('toast.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? t('dialog.editTitle') : t('dialog.createTitle')}</DialogTitle>
          <DialogDescription>{t('dialog.description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="mt-name">{t('dialog.name')}</Label>
            <Input
              id="mt-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('dialog.namePlaceholder')}
              maxLength={120}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mt-type">{t('dialog.type')}</Label>
            <select id="mt-type" value={type} onChange={(e) => setType(e.target.value as MaintenanceTaskType)} className={fieldClass}>
              {TASK_TYPES.map((tt) => (
                <option key={tt} value={tt}>
                  {t(`types.${tt}.label`)}
                </option>
              ))}
            </select>
            <p className="text-xs leading-relaxed text-muted-foreground/80">{t(`types.${type}.description`)}</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mt-kind">{t('dialog.scheduleKind')}</Label>
            <div className="grid grid-cols-3 gap-2">
              {SCHEDULE_KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setScheduleKind(k)}
                  className={cn(
                    'h-9.5 rounded-md border text-sm font-medium transition-colors ring-gold-focus',
                    scheduleKind === k
                      ? 'border-[rgba(212,175,55,0.5)] bg-[rgba(212,175,55,0.1)] text-gold-300'
                      : 'border-input bg-[var(--surface-1)] text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t(`schedule.${k}`)}
                </button>
              ))}
            </div>
          </div>

          {scheduleKind === 'INTERVAL' && (
            <div className="space-y-1.5">
              <Label htmlFor="mt-interval">{t('schedule.intervalLabel')}</Label>
              <Input
                id="mt-interval"
                type="number"
                min={1}
                max={43200}
                value={intervalMinutes}
                onChange={(e) => setIntervalMinutes(Number.parseInt(e.target.value, 10) || 1)}
              />
            </div>
          )}

          {scheduleKind !== 'INTERVAL' && (
            <div className="grid grid-cols-2 gap-3">
              {scheduleKind === 'WEEKLY' && (
                <div className="space-y-1.5">
                  <Label htmlFor="mt-weekday">{t('schedule.weekdayLabel')}</Label>
                  <select id="mt-weekday" value={weekday} onChange={(e) => setWeekday(Number(e.target.value))} className={fieldClass}>
                    {WEEKDAYS.map((d) => (
                      <option key={d} value={d}>
                        {t(`weekdays.${d}`)}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className={cn('space-y-1.5', scheduleKind === 'DAILY' && 'col-span-2')}>
                <Label htmlFor="mt-time">{t('schedule.timeLabel')}</Label>
                <Input id="mt-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
              </div>
            </div>
          )}

          <div className="flex items-center justify-between rounded-lg border border-border-subtle bg-[var(--surface-1)] px-3.5 py-3">
            <div className="space-y-0.5">
              <p className="text-sm font-medium">{t('dialog.enabled')}</p>
              <p className="text-xs text-muted-foreground/80">{t('dialog.enabledHint')}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              aria-label={t('dialog.enabled')}
              onClick={() => setEnabled((v) => !v)}
              className={cn(
                'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ring-gold-focus',
                enabled ? 'bg-gold-500/80' : 'bg-secondary',
              )}
            >
              <span
                className={cn(
                  'inline-block size-5 transform rounded-full bg-white shadow transition-transform',
                  enabled ? 'translate-x-5' : 'translate-x-0.5',
                )}
              />
            </button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            {tc('actions.cancel')}
          </Button>
          <Button onClick={onSubmit} loading={busy} disabled={!valid}>
            <Save className="size-4" /> {editing ? t('actions.save') : t('actions.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
