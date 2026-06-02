'use client';

import { Clock, History, LogOut, UsersRound } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Monogram } from '@/components/composite/monogram';
import { PageHeader } from '@/components/composite/page-header';
import { StatCard } from '@/components/composite/stat-card';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useSessionHistory } from '@/lib/hooks';
import type { SessionEndReason } from '@/lib/types';
import { formatDuration } from '@/lib/utils';

const END_REASON_VARIANT: Record<SessionEndReason, 'outline' | 'success' | 'info' | 'destructive'> = {
  USER: 'success',
  TIMEOUT: 'info',
  ADMIN: 'outline',
  ERROR: 'destructive',
};

const END_REASON_LABEL: Record<SessionEndReason, string> = {
  USER: 'User ended',
  TIMEOUT: 'Timed out',
  ADMIN: 'Admin',
  ERROR: 'Error',
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function HistoryPage() {
  const history = useSessionHistory();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!query) return history;
    const q = query.toLowerCase();
    return history.filter(
      (h) =>
        h.user.name.toLowerCase().includes(q) ||
        h.workspaceName.toLowerCase().includes(q) ||
        h.zone.toLowerCase().includes(q),
    );
  }, [history, query]);

  const uniqueUsers = new Set(history.map((h) => h.user.id)).size;
  const avgDuration =
    history.length > 0
      ? Math.floor(history.reduce((s, h) => s + h.durationSec, 0) / history.length)
      : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Session History"
        description="Completed and terminated sessions across all zones and users."
        actions={
          <Badge variant="gold" className="tnum">
            {history.length} records
          </Badge>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total sessions" value={history.length} icon={History} primary />
        <StatCard label="Unique users" value={uniqueUsers} icon={UsersRound} />
        <StatCard label="Avg duration (min)" value={Math.round(avgDuration / 60)} icon={Clock} />
      </div>

      <div className="max-w-md">
        <Input
          placeholder="Search by user, workspace or zone…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <Card elevation={1} className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-subtle text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-5 py-3 font-medium">Workspace</th>
                <th className="px-5 py-3 font-medium">User</th>
                <th className="px-5 py-3 font-medium">Zone</th>
                <th className="px-5 py-3 font-medium">Started</th>
                <th className="px-5 py-3 font-medium">Ended</th>
                <th className="px-5 py-3 font-medium">Duration</th>
                <th className="px-5 py-3 font-medium">End reason</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((h) => (
                <tr
                  key={h.id}
                  className="border-b border-border-subtle/60 transition-colors last:border-0 hover:bg-secondary/40"
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <Monogram name={h.workspaceName} className="size-9" />
                      <div className="min-w-0">
                        <p className="truncate font-medium">{h.workspaceName}</p>
                        <p className="text-xs text-muted-foreground">{h.connectionType}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <p className="truncate">{h.user.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{h.user.email}</p>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{h.zone}</td>
                  <td className="px-5 py-3 text-muted-foreground">{formatDateTime(h.startedAt)}</td>
                  <td className="px-5 py-3 text-muted-foreground">{formatDateTime(h.endedAt)}</td>
                  <td className="px-5 py-3 tnum text-muted-foreground">{formatDuration(h.durationSec)}</td>
                  <td className="px-5 py-3">
                    <Badge variant={END_REASON_VARIANT[h.endReason]}>
                      <LogOut className="size-3" />
                      {END_REASON_LABEL[h.endReason]}
                    </Badge>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-sm text-muted-foreground">
                    No session history found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
