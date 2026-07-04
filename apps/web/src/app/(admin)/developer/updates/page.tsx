'use client';

import { ArrowUpCircle, Check, CheckCircle2, Download, ExternalLink, Loader2, Plus, RefreshCw, Rocket, RotateCw, Wrench } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { CHANGELOG, CURRENT_VERSION, type ChangeType, localize } from '@/lib/changelog';
import { PageHeader } from '@/components/composite/page-header';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { checkForUpdates, type UpdateStatus } from '@/lib/update-check';
import { runUpdate, UPDATE_WORK_PHASES, type UpdateProgress } from '@/lib/update-run';
import { cn } from '@/lib/utils';

const TYPE_META: Record<ChangeType, { variant: BadgeProps['variant']; icon: typeof Plus; dot: string; text: string }> = {
  added: { variant: 'success', icon: Plus, dot: 'bg-success', text: 'text-success' },
  fixed: { variant: 'warning', icon: Wrench, dot: 'bg-warning', text: 'text-warning' },
  changed: { variant: 'info', icon: RefreshCw, dot: 'bg-info', text: 'text-info' },
};
const TYPE_ORDER: ChangeType[] = ['added', 'fixed', 'changed'];

function formatDate(iso: string, locale: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long', day: 'numeric' }).format(d);
}

export default function UpdatesPage() {
  const t = useTranslations('developer.updates');
  const locale = useLocale();
  const latest = CHANGELOG[0];

  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState<UpdateStatus | null>(null);

  // Update run: staged progress + a terminal "done" (offer a reload).
  const [progress, setProgress] = useState<UpdateProgress | null>(null);
  const [updatedTo, setUpdatedTo] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const updating = progress !== null && progress.phase !== 'done';

  const onCheck = async () => {
    setChecking(true);
    try {
      const result = await checkForUpdates();
      setStatus(result);
      if (result.updateAvailable) {
        toast.success(t('checkAvailableToast', { version: result.latest }));
      } else {
        toast.success(t('checkUpToDateToast', { version: result.current }));
      }
    } catch {
      toast.error(t('checkFailed'));
    } finally {
      setChecking(false);
    }
  };

  const targetVersion = status?.latest ?? CURRENT_VERSION;

  const onUpdate = async () => {
    if (updating) return;
    setUpdatedTo(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await runUpdate(setProgress, controller.signal);
      setUpdatedTo(targetVersion);
      toast.success(t('updatedToast', { version: targetVersion }));
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') return;
      setProgress(null);
      toast.error(t('updateFailed'));
    }
  };

  const updateAvailable = status?.updateAvailable ?? false;

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('description')} />

      {/* Current version banner */}
      <Card elevation="gold" className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-[rgba(212,175,55,0.35)] bg-gold-500/10 text-gold-300">
          <Rocket className="size-6" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('currentVersion')}</p>
          <p className="font-display text-2xl font-semibold text-foreground" dir="ltr">
            v{CURRENT_VERSION}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:ms-auto">
          {!updateAvailable && !progress && (
            <span className="inline-flex items-center gap-2 rounded-full border border-[rgba(95,184,143,0.3)] bg-[rgba(95,184,143,0.1)] px-3 py-1.5 text-xs font-medium text-success">
              <CheckCircle2 className="size-4" />
              {status ? t('upToDateChecked') : t('upToDate')}
            </span>
          )}
          <Button variant="secondary" size="sm" onClick={() => void onCheck()} disabled={checking || updating}>
            {checking ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            {t('checkForUpdates')}
          </Button>
          <Button size="sm" onClick={() => void onUpdate()} disabled={updating || checking}>
            {updating ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
            {updateAvailable ? t('updateToVersion', { version: targetVersion }) : t('updateNow')}
          </Button>
        </div>
      </Card>

      {/* Update run — staged progress + reload-on-done */}
      {progress && (
        <UpdateProgressPanel progress={progress} updatedTo={updatedTo} onReload={() => window.location.reload()} onDismiss={() => setProgress(null)} />
      )}

      {/* Update-available banner */}
      {updateAvailable && status && (
        <Card elevation={1} className="gold-hairline flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-[rgba(212,175,55,0.35)] bg-gold-500/10 text-gold-300">
            <ArrowUpCircle className="size-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-foreground">
              {t('updateAvailable', { version: status.latest })}
            </p>
            <p className="text-sm text-muted-foreground">{status.notes || t('updateAvailableHint')}</p>
          </div>
          {status.url && (
            <Button asChild size="sm">
              <a href={status.url} target="_blank" rel="noreferrer">
                <ExternalLink className="size-3.5" /> {t('viewRelease')}
              </a>
            </Button>
          )}
        </Card>
      )}

      {/* Release timeline */}
      <div className="space-y-4">
        {CHANGELOG.map((release) => {
          const isLatest = release === latest;
          const grouped = TYPE_ORDER.map((type) => ({
            type,
            items: release.changes.filter((c) => c.type === type),
          })).filter((g) => g.items.length > 0);

          return (
            <Card key={release.version} elevation={1} className={cn('p-5', isLatest && 'gold-hairline')}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <Badge variant={isLatest ? 'gold' : 'outline'} className="text-sm" >
                  <span dir="ltr">v{release.version}</span>
                </Badge>
                {isLatest && (
                  <Badge variant="success">{t('latest')}</Badge>
                )}
                <span className="text-xs text-muted-foreground">{formatDate(release.date, locale)}</span>
                {release.title && (
                  <span className="w-full text-sm font-medium text-foreground sm:w-auto">
                    {localize(release.title, locale)}
                  </span>
                )}
              </div>

              <div className="mt-4 space-y-4">
                {grouped.map(({ type, items }) => {
                  const meta = TYPE_META[type];
                  const Icon = meta.icon;
                  return (
                    <div key={type}>
                      <div className="mb-1.5 flex items-center gap-2">
                        <Icon className={cn('size-3.5', meta.text)} />
                        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {t(`types.${type}`)}
                        </span>
                      </div>
                      <ul className="space-y-1.5 ps-1">
                        {items.map((item, i) => (
                          <li key={i} className="flex gap-2.5 text-sm text-foreground/90">
                            <span className={cn('mt-1.5 size-1.5 shrink-0 rounded-full', meta.dot)} />
                            <span>{localize(item.text, locale)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/** The staged update run: a progress bar, per-phase checklist, and — on
 *  completion — a reload prompt so the freshly-built app bundle is picked up. */
function UpdateProgressPanel({
  progress,
  updatedTo,
  onReload,
  onDismiss,
}: {
  progress: UpdateProgress;
  updatedTo: string | null;
  onReload: () => void;
  onDismiss: () => void;
}) {
  const t = useTranslations('developer.updates');
  const done = progress.phase === 'done';
  const pct = Math.round(progress.ratio * 100);

  return (
    <Card elevation={1} className="gold-hairline space-y-4 p-5">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-xl border',
            done
              ? 'border-[rgba(95,184,143,0.35)] bg-[rgba(95,184,143,0.1)] text-success'
              : 'border-[rgba(212,175,55,0.35)] bg-gold-500/10 text-gold-300',
          )}
        >
          {done ? <CheckCircle2 className="size-5" /> : <Loader2 className="size-5 animate-spin" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-foreground">{done ? t('updateDoneTitle') : t('updatingTitle')}</p>
          <p className="text-sm text-muted-foreground">
            {done ? t('updateDoneHint', { version: updatedTo ?? '' }) : t('updateRunNote')}
          </p>
        </div>
        {done && (
          <div className="flex shrink-0 items-center gap-2">
            <Button size="sm" onClick={onReload}>
              <RotateCw className="size-3.5" /> {t('reload')}
            </Button>
            <Button variant="ghost" size="sm" onClick={onDismiss}>
              {t('dismiss')}
            </Button>
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-gold-500 transition-[width] duration-500 ease-out" style={{ width: `${pct}%` }} />
      </div>

      {/* Per-phase checklist */}
      <ul className="space-y-2">
        {UPDATE_WORK_PHASES.map((phase, i) => {
          const state = done || progress.index > i ? 'done' : progress.index === i ? 'active' : 'pending';
          return (
            <li key={phase} className="flex items-center gap-2.5 text-sm">
              <span
                className={cn(
                  'flex size-5 shrink-0 items-center justify-center rounded-full',
                  state === 'done'
                    ? 'bg-success/15 text-success'
                    : state === 'active'
                      ? 'bg-gold-500/15 text-gold-300'
                      : 'bg-secondary text-muted-foreground',
                )}
              >
                {state === 'done' ? (
                  <Check className="size-3" />
                ) : state === 'active' ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <span className="size-1.5 rounded-full bg-current" />
                )}
              </span>
              <span className={cn(state === 'pending' ? 'text-muted-foreground' : 'text-foreground/90')}>
                {t(`phases.${phase}`)}
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
