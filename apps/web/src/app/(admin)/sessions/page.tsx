'use client';

import { Eye, MoreHorizontal, Square, XCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
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

const STATUS_FILTERS: Array<{ label: string; value: SessionStatus | 'ALL' }> = [
  { label: 'All', value: 'ALL' },
  { label: 'Running', value: 'RUNNING' },
  { label: 'Provisioning', value: 'PROVISIONING' },
  { label: 'Paused', value: 'PAUSED' },
  { label: 'Degraded', value: 'DEGRADED' },
];

export default function SessionsPage() {
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
    toast.success('Session terminated', { description: 'The container is being destroyed.' });
    setConfirmId(null);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Live Sessions"
        description="Every running, provisioning, and paused workspace session across all zones."
        actions={
          <Badge variant="gold" className="tnum">
            {filtered.length} sessions
          </Badge>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          placeholder="Search by user, workspace, zone or agent…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="sm:max-w-sm"
        />
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatus(f.value)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ring-gold-focus ${
                status === f.value
                  ? 'border-[rgba(212,175,55,0.4)] bg-gold-500/10 text-gold-300'
                  : 'border-border-subtle text-muted-foreground hover:text-foreground'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <Card elevation={1} className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-subtle text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-5 py-3 font-medium">Workspace</th>
                <th className="px-5 py-3 font-medium">User</th>
                <th className="px-5 py-3 font-medium">Zone / Agent</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">CPU</th>
                <th className="px-5 py-3 font-medium">Memory</th>
                <th className="px-5 py-3 font-medium">Uptime</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr
                  key={s.id}
                  onClick={() => router.push(`/sessions/${s.id}`)}
                  className="cursor-pointer border-b border-border-subtle/60 transition-colors last:border-0 hover:bg-secondary/40"
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
                        <Button variant="ghost" size="icon-sm" aria-label="Actions">
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => router.push(`/sessions/${s.id}`)}>
                          <Eye /> View details
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => toast('Pause requested')}>
                          <Square /> Pause
                        </DropdownMenuItem>
                        <DropdownMenuItem destructive onSelect={() => setConfirmId(s.id)}>
                          <XCircle /> Terminate
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filtered.length === 0 && (
            <div className="py-16 text-center">
              <p className="font-display text-lg">No sessions match your filters</p>
              <p className="mt-1 text-sm text-muted-foreground">Try clearing the search or status filter.</p>
            </div>
          )}
        </div>
      </Card>

      <Dialog open={!!confirmId} onOpenChange={(o) => !o && setConfirmId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Terminate session?</DialogTitle>
            <DialogDescription>
              {target ? (
                <>
                  This will destroy the <span className="text-foreground">{target.workspaceName}</span> container
                  for <span className="text-foreground">{target.user.name}</span>. Unsaved work in the session
                  will be lost.
                </>
              ) : (
                'This will destroy the session container.'
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfirmId(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={onTerminate}>
              <XCircle className="size-4" /> Terminate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
