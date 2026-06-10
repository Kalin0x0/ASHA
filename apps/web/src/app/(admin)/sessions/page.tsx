'use client';

import { Eye, Monitor, MoreHorizontal, Square, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/composite/empty-state';
import { Monogram } from '@/components/composite/monogram';
import { PageHeader } from '@/components/composite/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { SessionStatusPill } from '@/components/ui/status-pill';
import { useSessions, useTerminateSession } from '@/lib/hooks';
import type { SessionStatus } from '@/lib/types';
import { formatDuration } from '@/lib/utils';

const STATUS_FILTERS: Array<SessionStatus | 'ALL'> = ['ALL', 'RUNNING', 'PROVISIONING', 'PAUSED', 'DEGRADED'];

export default function SessionsPage() {
  const t = useTranslations('sessions');
  const tc = useTranslations('common');
  const router = useRouter();
  const sessions = useSessions();
  const terminate = useTerminateSession();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<SessionStatus | 'ALL'>('ALL');
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return sessions.filter((s) => {
      if (status !== 'ALL' && s.status !== status) return false;
      if (!query) return true;
      const q = query.toLowerCase();
      return (
        s.user.name.toLowerCase().includes(q) ||
        s.workspaceName.toLowerCase().includes(q) ||
        s.zone.toLowerCase().includes(q) ||
        s.agent.toLowerCase().includes(q)
      );
    });
  }, [sessions, query, status]);

  const target = sessions.find((s) => s.id === confirmId);

  const onTerminate = () => {
    if (!confirmId) return;
    terminate(confirmId);
    toast.success(t('list.toastTerminated'), { description: t('list.toastTerminatedDescription') });
    setConfirmId(null);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('list.title')}
        description={t('list.description')}
        actions={
          <Badge variant="gold" className="tnum">
            {t('list.sessionCount', { count: filtered.length })}
          </Badge>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          placeholder={t('list.searchPlaceholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="sm:max-w-sm"
        />
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setStatus(f)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ring-gold-focus ${
                status === f
                  ? 'border-[rgba(212,175,55,0.4)] bg-gold-500/10 text-gold-300'
                  : 'border-border-subtle text-muted-foreground hover:text-foreground'
              }`}
            >
              {f === 'ALL' ? tc('labels.all') : tc(`sessionStatus.${f}`)}
            </button>
          ))}
        </div>
      </div>

      <Card elevation={1} className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-[color-mix(in_srgb,var(--surface-2)_45%,transparent)] text-left text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                <th className="px-5 py-3 font-medium">{t('list.columns.workspace')}</th>
                <th className="px-5 py-3 font-medium">{t('list.columns.user')}</th>
                <th className="px-5 py-3 font-medium">{t('list.columns.zoneAgent')}</th>
                <th className="px-5 py-3 font-medium">{tc('labels.status')}</th>
                <th className="px-5 py-3 font-medium">CPU</th>
                <th className="px-5 py-3 font-medium">{t('list.columns.memory')}</th>
                <th className="px-5 py-3 font-medium">{t('list.columns.uptime')}</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr
                  key={s.id}
                  onClick={() => router.push(`/sessions/${s.id}`)}
                  className="group cursor-pointer border-b border-border-subtle/60 transition-all duration-150 last:border-0 hover:bg-gold-500/[0.05] hover:shadow-[inset_2px_0_0_rgba(212,175,55,0.55)]"
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <Monogram name={s.workspaceName} className="size-9" />
                      <div className="min-w-0">
                        <p className="truncate font-medium">{s.workspaceName}</p>
                        <p className="font-mono text-xs text-muted-foreground">{s.kasmId.slice(0, 10)}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <p className="truncate">{s.user.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{s.user.email}</p>
                  </td>
                  <td className="px-5 py-3">
                    <p>{s.zone}</p>
                    <p className="truncate text-xs text-muted-foreground">{s.agent}</p>
                  </td>
                  <td className="px-5 py-3">
                    <SessionStatusPill status={s.status} />
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <span className="w-9 tnum text-xs text-muted-foreground">{Math.round(s.cpuPct)}%</span>
                      <Progress value={s.cpuPct} className="w-16" tone={s.cpuPct > 85 ? 'destructive' : 'gold'} />
                    </div>
                  </td>
                  <td className="px-5 py-3 tnum text-muted-foreground">
                    {(s.memMb / 1024).toFixed(1)} / {(s.memLimitMb / 1024).toFixed(0)} GB
                  </td>
                  <td className="px-5 py-3 tnum text-muted-foreground">{formatDuration(s.uptimeSec)}</td>
                  <td className="px-5 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label={tc('labels.actions')}>
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => router.push(`/sessions/${s.id}`)}>
                          <Eye /> {t('list.viewDetails')}
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => toast(t('list.toastPauseRequested'))}>
                          <Square /> {t('list.pause')}
                        </DropdownMenuItem>
                        <DropdownMenuItem destructive onSelect={() => setConfirmId(s.id)}>
                          <XCircle /> {tc('actions.terminate')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filtered.length === 0 && (
            <EmptyState
              icon={Monitor}
              title={t('list.emptyTitle')}
              description={t('list.emptyDescription')}
            />
          )}
        </div>
      </Card>

      <Dialog open={!!confirmId} onOpenChange={(o) => !o && setConfirmId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('list.confirmTitle')}</DialogTitle>
            <DialogDescription>
              {target
                ? t.rich('list.confirmDescription', {
                    workspace: target.workspaceName,
                    user: target.user.name,
                    strong: (chunks) => <span className="text-foreground">{chunks}</span>,
                  })
                : t('list.confirmDescriptionFallback')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfirmId(null)}>
              {tc('actions.cancel')}
            </Button>
            <Button variant="destructive" onClick={onTerminate}>
              <XCircle className="size-4" /> {tc('actions.terminate')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
