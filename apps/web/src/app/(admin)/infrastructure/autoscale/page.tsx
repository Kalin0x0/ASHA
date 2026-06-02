'use client';

import { Gauge, Loader2, Network } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/composite/page-header';
import { StatCard } from '@/components/composite/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { type ApiServerPool, getPools } from '@/lib/api/endpoints';
import { isLive } from '@/lib/api/mode';

export default function AutoScalePage() {
  const [pools, setPools] = useState<ApiServerPool[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!isLive) return;
    setLoading(true);
    try {
      setPools(await getPools());
    } catch {
      toast.error('Failed to load autoscale policies');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const autoscaled = pools.filter((p) => p.autoscaleConfig);

  return (
    <div className="space-y-6">
      <PageHeader
        title="AutoScale"
        description="Overview of autoscale policies across server pools. Capacity grows and shrinks based on load, schedule, or AD demand."
        actions={
          <Button asChild variant="secondary" size="sm">
            <Link href="/infrastructure/server-pools">Manage pools</Link>
          </Button>
        }
      />

      {!isLive && (
        <Card elevation={1} className="p-4 text-sm text-muted-foreground">
          AutoScale is live-backend only. Run with{' '}
          <code className="rounded bg-anthracite-950/60 px-1.5 py-0.5 text-xs">NEXT_PUBLIC_API_MODE=live</code>.
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Autoscaled pools" value={autoscaled.length} icon={Gauge} primary />
        <StatCard label="Max instances" value={autoscaled.reduce((a, p) => a + (p.autoscaleConfig?.maxInstances ?? 0), 0)} icon={Network} />
        <StatCard label="Standby" value={autoscaled.reduce((a, p) => a + (p.autoscaleConfig?.minStandby ?? 0), 0)} icon={Network} />
      </div>

      <Card elevation={1} className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border-subtle p-4">
          <h2 className="font-display text-lg font-medium">Active policies</h2>
          {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        </div>
        <div className="divide-y divide-border-subtle/60">
          {autoscaled.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">
              No autoscale policies yet. Enable autoscale on a pool from{' '}
              <Link href="/infrastructure/server-pools" className="text-gold-300 hover:underline">
                Server Pools
              </Link>
              .
            </p>
          ) : (
            autoscaled.map((p) => {
              const c = p.autoscaleConfig!;
              return (
                <div key={p.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                  <Gauge className="size-4 text-gold-300" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{p.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      standby {c.minStandby} · max {c.maxInstances} · {c.perServerSessionLimit}/server · check-in {c.checkinIntervalSec}s
                    </p>
                  </div>
                  <Badge variant="gold">{c.mode}</Badge>
                  <Badge variant="outline">{p.kind}</Badge>
                </div>
              );
            })
          )}
        </div>
      </Card>
    </div>
  );
}
