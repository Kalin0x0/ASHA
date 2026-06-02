'use client';

import { Loader2, RefreshCw, ScrollText, Search } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/composite/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { type ApiAuditEntry, getAuditLog } from '@/lib/api/endpoints';
import { isLive } from '@/lib/api/mode';

export default function AuditLogPage() {
  const [entries, setEntries] = useState<ApiAuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');

  const refresh = useCallback(async () => {
    if (!isLive) return;
    setLoading(true);
    try {
      setEntries(await getAuditLog(200, filter.trim() || undefined));
    } catch {
      toast.error('Failed to load audit log');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Log"
        description="Immutable record of administrative and security-relevant actions across the organization."
        actions={
          <Button variant="secondary" size="sm" onClick={() => void refresh()} disabled={!isLive || loading}>
            {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            Refresh
          </Button>
        }
      />

      {!isLive && (
        <Card elevation={1} className="p-4 text-sm text-muted-foreground">
          The audit log is live-backend only. Run with{' '}
          <code className="rounded bg-anthracite-950/60 px-1.5 py-0.5 text-xs">NEXT_PUBLIC_API_MODE=live</code>.
        </Card>
      )}

      <Card elevation={1} className="overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border-subtle p-4">
          <Search className="size-4 text-muted-foreground" />
          <Input
            placeholder="Filter by action (e.g. session, apikey, vmprovider)…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="max-w-md"
          />
        </div>
        <div className="divide-y divide-border-subtle/60">
          {entries.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">
              {isLive ? 'No audit entries match.' : 'Connect the live backend to view the audit log.'}
            </p>
          ) : (
            entries.map((e) => (
              <div key={e.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                <ScrollText className="size-4 shrink-0 text-gold-300" />
                <Badge variant="outline" className="font-mono text-[11px]">{e.action}</Badge>
                <div className="min-w-0 flex-1">
                  {e.targetType && (
                    <span className="text-xs text-muted-foreground">
                      {e.targetType}
                      {e.targetId ? ` · ${e.targetId.slice(0, 12)}` : ''}
                    </span>
                  )}
                </div>
                {e.ip && <span className="hidden font-mono text-[11px] text-muted-foreground sm:inline">{e.ip}</span>}
                <span className="shrink-0 text-xs text-muted-foreground tnum">
                  {new Date(e.createdAt).toLocaleString()}
                </span>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
