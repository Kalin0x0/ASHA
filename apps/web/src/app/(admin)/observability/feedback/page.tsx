'use client';

import { Bot, Bug, ExternalLink, Loader2, MessageSquarePlus, MessageSquareWarning, Send, Trash2, User } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/composite/empty-state';
import { PageHeader } from '@/components/composite/page-header';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useConfirm } from '@/components/ui/confirm';
import { useDeleteFeedback, useFeedback, useUpdateFeedback, useUsers } from '@/lib/hooks';
import type { FeedbackItem, FeedbackStatus } from '@/lib/types';
import { cn, formatRelativeTime } from '@/lib/utils';

const STATUSES: FeedbackStatus[] = ['OPEN', 'IN_PROGRESS', 'FIXED', 'WONTFIX'];
const STATUS_VARIANT: Record<FeedbackStatus, BadgeProps['variant']> = {
  OPEN: 'warning',
  IN_PROGRESS: 'info',
  FIXED: 'success',
  WONTFIX: 'outline',
};

const SELECT =
  'h-8 rounded-md border border-border-subtle bg-[var(--surface-1)] px-2 text-xs outline-none ring-gold-focus';

export default function FeedbackTriagePage() {
  const t = useTranslations('feedback');
  const items = useFeedback();
  const users = useUsers();

  const [filter, setFilter] = useState<'ALL' | FeedbackStatus>('ALL');
  const [lightbox, setLightbox] = useState<string | null>(null);

  const nameFor = useMemo(() => {
    const byId = new Map(users.map((u) => [u.id, u.name] as const));
    return (author: string): { label: string; agent: boolean } => {
      if (author.startsWith('agent:')) return { label: author.slice('agent:'.length) || 'agent', agent: true };
      return { label: byId.get(author) ?? author, agent: false };
    };
  }, [users]);

  const filtered = useMemo(
    () => (filter === 'ALL' ? items : items.filter((f) => f.status === filter)),
    [items, filter],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: items.length };
    for (const s of STATUSES) c[s] = items.filter((f) => f.status === s).length;
    return c;
  }, [items]);

  return (
    <div className="space-y-6">
      <PageHeader title={t('triage.title')} description={t('triage.description')} />

      <Card elevation={1} className="flex items-start gap-3 p-4">
        <Bot className="mt-0.5 size-5 shrink-0 text-gold-300" />
        <p className="text-sm text-muted-foreground">{t('triage.memoryNote')}</p>
      </Card>

      <div className="flex flex-wrap gap-1.5">
        {(['ALL', ...STATUSES] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors ring-gold-focus',
              filter === s
                ? 'border-[rgba(212,175,55,0.4)] bg-gold-500/10 text-gold-300'
                : 'border-border-subtle text-muted-foreground hover:text-foreground',
            )}
          >
            {s === 'ALL' ? t('triage.filterAll') : t(`status.${s}`)}
            <span className="ms-1.5 text-muted-foreground/70">{counts[s] ?? 0}</span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={MessageSquareWarning} title={t('triage.emptyTitle')} description={t('triage.emptyDescription')} />
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => (
            <FeedbackCard key={item.id} item={item} nameFor={nameFor} onOpenImage={setLightbox} />
          ))}
        </div>
      )}

      <Dialog open={!!lightbox} onOpenChange={(o) => !o && setLightbox(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('triage.screenshot')}</DialogTitle>
          </DialogHeader>
          {lightbox && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={lightbox} alt={t('triage.screenshot')} className="max-h-[70vh] w-full rounded-lg object-contain" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FeedbackCard({
  item,
  nameFor,
  onOpenImage,
}: {
  item: FeedbackItem;
  nameFor: (author: string) => { label: string; agent: boolean };
  onOpenImage: (url: string) => void;
}) {
  const t = useTranslations('feedback');
  const tc = useTranslations('common');
  const updateFeedback = useUpdateFeedback();
  const deleteFeedback = useDeleteFeedback();
  const confirm = useConfirm();
  const [note, setNote] = useState('');
  const [status, setStatus] = useState<FeedbackStatus>(item.status);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const dirty = note.trim().length > 0 || status !== item.status;

  const onDelete = async () => {
    const ok = await confirm({
      title: t('triage.delete.confirmTitle'),
      description: t('triage.delete.confirmBody'),
      confirmLabel: tc('actions.delete'),
      destructive: true,
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await deleteFeedback(item.id);
      toast.success(t('triage.delete.done'));
    } catch (err) {
      setDeleting(false);
      toast.error(err instanceof Error ? err.message : t('triage.delete.failed'));
    }
  };

  const save = async () => {
    if (!dirty) return;
    setSaving(true);
    try {
      await updateFeedback(item.id, {
        status: status !== item.status ? status : undefined,
        note: note.trim() || undefined,
      });
      setNote('');
      toast.success(t('triage.saved'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('triage.saveFailed'));
      setStatus(item.status);
    } finally {
      setSaving(false);
    }
  };

  const Kind = item.kind === 'BUG' ? Bug : MessageSquarePlus;

  return (
    <Card elevation={1} className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={item.kind === 'BUG' ? 'destructive' : 'gold'}>
          <Kind className="size-3" /> {t(`kind.${item.kind}`)}
        </Badge>
        <Badge variant={STATUS_VARIANT[item.status]}>{t(`status.${item.status}`)}</Badge>
        <span className="text-xs text-muted-foreground">{formatRelativeTime(item.createdAt)}</span>
        {item.pageUrl && (
          <a
            href={item.pageUrl}
            className="ms-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-gold-300 ring-gold-focus rounded"
            dir="ltr"
          >
            <ExternalLink className="size-3" /> {item.pageUrl}
          </a>
        )}
      </div>

      <p className="mt-2.5 whitespace-pre-wrap text-sm text-foreground">{item.message}</p>

      {item.screenshot && (
        <button
          type="button"
          onClick={() => onOpenImage(item.screenshot!)}
          className="mt-3 block overflow-hidden rounded-lg border border-border-subtle ring-gold-focus"
          title={t('triage.viewScreenshot')}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.screenshot} alt={t('triage.screenshot')} className="max-h-40 w-auto object-contain bg-anthracite-950/60" />
        </button>
      )}

      {/* Collaboration thread */}
      {item.notes.length > 0 && (
        <ol className="mt-3 space-y-2 border-s border-border-subtle ps-3">
          {item.notes.map((n, i) => {
            const who = nameFor(n.author);
            return (
              <li key={i} className="text-sm">
                <span className="inline-flex items-center gap-1.5 text-xs font-medium">
                  {who.agent ? <Bot className="size-3 text-gold-300" /> : <User className="size-3 text-muted-foreground" />}
                  <span className={who.agent ? 'text-gold-300' : 'text-foreground'}>{who.label}</span>
                  <span className="text-muted-foreground/70">· {formatRelativeTime(n.at)}</span>
                </span>
                <p className="mt-0.5 whitespace-pre-wrap text-muted-foreground">{n.body}</p>
              </li>
            );
          })}
        </ol>
      )}

      {/* Triage controls */}
      <div className="mt-3 flex flex-col gap-2 border-t border-border-subtle pt-3 sm:flex-row sm:items-center">
        <input
          className="h-8 flex-1 rounded-md border border-input bg-[var(--surface-1)] px-2.5 text-sm outline-none ring-gold-focus placeholder:text-muted-foreground/70"
          placeholder={t('triage.notePlaceholder')}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void save();
          }}
        />
        <div className="flex items-center gap-2">
          <select className={SELECT} value={status} onChange={(e) => setStatus(e.target.value as FeedbackStatus)}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`status.${s}`)}
              </option>
            ))}
          </select>
          <Button size="sm" onClick={() => void save()} disabled={!dirty || saving}>
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
            {tc('actions.save')}
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => void onDelete()}
            loading={deleting}
            aria-label={tc('actions.delete')}
            title={tc('actions.delete')}
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
