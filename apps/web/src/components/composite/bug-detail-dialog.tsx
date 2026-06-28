'use client';

import { BrainCircuit, CheckCircle2, FileCode2, Sparkles, Wrench } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, Label } from '@/components/ui/input';
import { severityVariant, sourceVariant, statusVariant } from '@/lib/bug-display';
import { useBugReport, useResolveBug, useUpdateBug } from '@/lib/hooks';
import type { BugFixRow } from '@/lib/types';

const textareaClass =
  'flex w-full resize-y rounded-md border border-input bg-[var(--surface-1)] px-3 py-2 text-sm transition-shadow placeholder:text-muted-foreground/70 focus-visible:border-[rgba(212,175,55,0.5)] focus-visible:shadow-[var(--gold-glow)] focus-visible:outline-none';

function FixCard({
  fix,
  known,
  label,
}: {
  fix: BugFixRow;
  known?: boolean;
  label: string;
}) {
  const t = useTranslations('support.fix');
  return (
    <Card elevation={known ? 'gold' : 1} className="space-y-3 p-4">
      <div className="flex items-center gap-2">
        {known ? (
          <BrainCircuit className="size-4 text-gold-300" />
        ) : (
          <CheckCircle2 className="size-4 text-success" />
        )}
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <Badge variant={fix.authoredBy === 'AI' ? 'gold' : 'default'} className="ms-auto">
          {fix.authoredBy === 'AI' && <Sparkles className="size-3" />}
          {fix.authorName ?? (fix.authoredBy === 'AI' ? 'AI' : 'Human')}
        </Badge>
      </div>
      <div className="space-y-2.5 text-sm">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{t('rootCause')}</p>
          <p className="mt-0.5 leading-relaxed">{fix.rootCause}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground">{t('resolution')}</p>
          <p className="mt-0.5 leading-relaxed">{fix.resolution}</p>
        </div>
        {fix.prevention && (
          <div>
            <p className="text-xs font-medium text-muted-foreground">{t('prevention')}</p>
            <p className="mt-0.5 leading-relaxed">{fix.prevention}</p>
          </div>
        )}
        {fix.filesTouched.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground">{t('filesTouched')}</p>
            <ul className="mt-1 space-y-0.5">
              {fix.filesTouched.map((f) => (
                <li key={f} className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
                  <FileCode2 className="size-3 shrink-0" /> {f}
                </li>
              ))}
            </ul>
          </div>
        )}
        {fix.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {fix.tags.map((tag) => (
              <Badge key={tag} variant="outline">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

export function BugDetailDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const t = useTranslations('support.detail');
  const tStatus = useTranslations('support.status');
  const tSeverity = useTranslations('support.severity');
  const tSource = useTranslations('support.source');
  const tResolve = useTranslations('support.resolve');
  const tc = useTranslations('common');
  const locale = useLocale();

  const report = useBugReport(id ?? '');
  const updateBug = useUpdateBug();
  const resolveBug = useResolveBug();

  const [resolving, setResolving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rootCause, setRootCause] = useState('');
  const [resolution, setResolution] = useState('');
  const [prevention, setPrevention] = useState('');
  const [filesTouched, setFilesTouched] = useState('');
  const [tags, setTags] = useState('');
  const [byAi, setByAi] = useState(false);

  const resetForm = () => {
    setResolving(false);
    setRootCause('');
    setResolution('');
    setPrevention('');
    setFilesTouched('');
    setTags('');
    setByAi(false);
  };

  const fmtDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' }) : '—';

  const onResolve = async () => {
    if (!id || rootCause.trim().length < 1 || resolution.trim().length < 1) return;
    setBusy(true);
    try {
      await resolveBug(id, {
        rootCause: rootCause.trim(),
        resolution: resolution.trim(),
        prevention: prevention.trim() || undefined,
        filesTouched: filesTouched
          .split(/[\n,]/)
          .map((s) => s.trim())
          .filter(Boolean),
        tags: tags
          .split(/[\n,]/)
          .map((s) => s.trim())
          .filter(Boolean),
        authoredBy: byAi ? 'AI' : 'HUMAN',
      });
      toast.success(tResolve('success'));
      resetForm();
    } catch {
      toast.error(tResolve('error'));
    } finally {
      setBusy(false);
    }
  };

  const onReopen = async () => {
    if (!id) return;
    await updateBug(id, { status: 'IN_PROGRESS' });
  };

  return (
    <Dialog
      open={Boolean(id)}
      onOpenChange={(o) => {
        if (!o) {
          resetForm();
          onClose();
        }
      }}
    >
      <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
        {report ? (
          <>
            <DialogHeader>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={statusVariant[report.status]}>{tStatus(report.status)}</Badge>
                <Badge variant={severityVariant[report.severity]}>{tSeverity(report.severity)}</Badge>
                <Badge variant={sourceVariant[report.source]}>{tSource(report.source)}</Badge>
                {report.errorCode && (
                  <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs text-gold-300">
                    {report.errorCode}
                  </code>
                )}
              </div>
              <DialogTitle className="pe-6 leading-snug">{report.title}</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              {/* Meta grid */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
                <Meta label={t('component')} value={report.component ?? '—'} />
                <Meta label={t('route')} value={report.route ?? '—'} mono />
                <Meta label={t('occurrences')} value={String(report.occurrences)} />
                <Meta label={t('firstSeen')} value={fmtDate(report.createdAt)} />
                <Meta label={t('lastSeen')} value={fmtDate(report.lastSeenAt)} />
                <Meta label={t('reporter')} value={report.reporterEmail ?? t('automatic')} />
              </div>

              <div>
                <p className="text-xs font-medium text-muted-foreground">{t('description')}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{report.description}</p>
              </div>

              {report.stackTrace && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground">{t('stackTrace')}</p>
                  <pre className="mt-1 max-h-48 overflow-auto rounded-lg border border-border-subtle bg-[var(--surface-1)] p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
                    {report.stackTrace}
                  </pre>
                </div>
              )}

              {/* Linked resolution */}
              {report.fix && <FixCard fix={report.fix} label={t('documentedFix')} />}

              {/* The "memory": a prior fix for the same signature */}
              {!report.fix && report.knownFix && (
                <FixCard fix={report.knownFix} known label={t('knownFix')} />
              )}

              {/* Resolve & document */}
              {report.status !== 'RESOLVED' ? (
                resolving ? (
                  <Card elevation={1} className="space-y-3 p-4">
                    <div className="flex items-center gap-2">
                      <Wrench className="size-4 text-gold-300" />
                      <span className="text-sm font-medium">{tResolve('heading')}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{tResolve('intro')}</p>
                    <div className="space-y-1.5">
                      <Label htmlFor="r-root">{tResolve('rootCause')}</Label>
                      <textarea id="r-root" rows={3} className={textareaClass} value={rootCause} onChange={(e) => setRootCause(e.target.value)} placeholder={tResolve('rootCausePlaceholder')} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="r-res">{tResolve('resolution')}</Label>
                      <textarea id="r-res" rows={3} className={textareaClass} value={resolution} onChange={(e) => setResolution(e.target.value)} placeholder={tResolve('resolutionPlaceholder')} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="r-prev">{tResolve('prevention')}</Label>
                      <textarea id="r-prev" rows={2} className={textareaClass} value={prevention} onChange={(e) => setPrevention(e.target.value)} placeholder={tResolve('preventionPlaceholder')} />
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="r-files">{tResolve('filesTouched')}</Label>
                        <Input id="r-files" value={filesTouched} onChange={(e) => setFilesTouched(e.target.value)} placeholder={tResolve('filesTouchedPlaceholder')} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="r-tags">{tResolve('tags')}</Label>
                        <Input id="r-tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder={tResolve('tagsPlaceholder')} />
                      </div>
                    </div>
                    <label className="flex items-center gap-2 text-sm text-muted-foreground">
                      <input type="checkbox" checked={byAi} onChange={(e) => setByAi(e.target.checked)} className="size-4 accent-[var(--color-gold-500)]" />
                      {tResolve('authoredByAi')}
                    </label>
                    <div className="flex justify-end gap-2 pt-1">
                      <Button variant="ghost" onClick={() => setResolving(false)} disabled={busy}>
                        {tc('actions.cancel')}
                      </Button>
                      <Button onClick={onResolve} loading={busy} disabled={!rootCause.trim() || !resolution.trim()}>
                        <CheckCircle2 className="size-4" /> {tResolve('submit')}
                      </Button>
                    </div>
                  </Card>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button onClick={() => setResolving(true)}>
                      <Wrench className="size-4" /> {tResolve('open')}
                    </Button>
                    {report.status !== 'IN_PROGRESS' && (
                      <Button variant="secondary" onClick={() => id && updateBug(id, { status: 'IN_PROGRESS' })}>
                        {t('markInProgress')}
                      </Button>
                    )}
                    {report.status !== 'WONT_FIX' && (
                      <Button variant="ghost" onClick={() => id && updateBug(id, { status: 'WONT_FIX' })}>
                        {t('wontFix')}
                      </Button>
                    )}
                  </div>
                )
              ) : (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-[rgba(95,184,143,0.3)] bg-[rgba(95,184,143,0.08)] px-4 py-3">
                  <span className="flex items-center gap-2 text-sm text-success">
                    <CheckCircle2 className="size-4" /> {t('resolvedNote', { date: fmtDate(report.resolvedAt) })}
                  </span>
                  <Button variant="ghost" size="sm" onClick={onReopen}>
                    {t('reopen')}
                  </Button>
                </div>
              )}
            </div>
          </>
        ) : (
          <p className="py-10 text-center text-sm text-muted-foreground">{t('notFound')}</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Meta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-muted-foreground/70">{label}</p>
      <p className={`truncate text-foreground/90 ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  );
}
