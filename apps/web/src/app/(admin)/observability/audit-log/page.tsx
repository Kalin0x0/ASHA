'use client';

import { Loader2, RefreshCw, ScrollText, Search } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/composite/empty-state';
import { PageHeader } from '@/components/composite/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { type ApiAuditEntry, getAuditLog } from '@/lib/api/endpoints';
import { isLive } from '@/lib/api/mode';

export default function AuditLogPage() {
  const t = useTranslations('observability');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const [entries, setEntries] = useState<ApiAuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');

  const refresh = useCallback(async () => {
    if (!isLive) return;
    setLoading(true);
    try {
      setEntries(await getAuditLog(200, filter.trim() || undefined));
    } catch {
      toast.error(t('auditLog.loadError'));
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
        title={t('auditLog.title')}
        description={t('auditLog.description')}
        actions={
          <Button variant="secondary" size="sm" onClick={() => void refresh()} disabled={!isLive || loading}>
            {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            {tCommon('actions.refresh')}
          </Button>
        }
      />

      {!isLive && (
        <Card elevation={1} className="p-4 text-sm text-muted-foreground">
          {t('auditLog.liveOnlyNotice')}{' '}
          <code className="rounded bg-anthracite-950/60 px-1.5 py-0.5 text-xs">NEXT_PUBLIC_API_MODE=live</code>.
        </Card>
      )}

      <Card elevation={1} className="overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border-subtle p-4">
          <Search className="size-4 text-muted-foreground" />
          <Input
            placeholder={t('auditLog.filterPlaceholder')}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="max-w-md"
          />
        </div>
        <div className="divide-y divide-border-subtle/60">
          {entries.length === 0 ? (
            <EmptyState
              icon={ScrollText}
              title={isLive ? t('auditLog.noEntriesTitle') : t('auditLog.backendNotConnectedTitle')}
              description={isLive ? t('auditLog.noEntriesDescription') : t('auditLog.backendNotConnectedDescription')}
            />
          ) : (
            entries.map((e) => (
              <div key={e.id} className="flex items-center gap-3 px-5 py-2.5 text-sm transition-all duration-150 hover:bg-gold-500/[0.05] hover:shadow-[inset_2px_0_0_rgba(212,175,55,0.55)]">
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
                  {new Date(e.createdAt).toLocaleString(locale)}
                </span>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
