'use client';

import { BadgeCheck, Loader2, Save, Users, Zap } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/composite/page-header';
import { StatCard } from '@/components/composite/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { type ApiLicenseUsage, getLicenseUsage, upsertLicense } from '@/lib/api/endpoints';
import { isLive } from '@/lib/api/mode';
import { cn } from '@/lib/utils';

export default function LicensingPage() {
  const t = useTranslations('settings');
  const [usage, setUsage] = useState<ApiLicenseUsage | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [type, setType] = useState<'CONCURRENT' | 'NAMED_USER'>('CONCURRENT');
  const [seats, setSeats] = useState(5);
  const [concurrent, setConcurrent] = useState(5);

  const refresh = useCallback(async () => {
    if (!isLive) return;
    setLoading(true);
    try {
      const u = await getLicenseUsage();
      setUsage(u);
      if (u.type) setType(u.type);
      if (u.seats) setSeats(u.seats);
      if (u.concurrentSessions) setConcurrent(u.concurrentSessions);
    } catch {
      toast.error(t('licensing.toasts.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onSave = async () => {
    setSaving(true);
    try {
      await upsertLicense({ type, seats, concurrentSessions: concurrent });
      toast.success(t('licensing.toasts.saved'));
      await refresh();
    } catch {
      toast.error(t('licensing.toasts.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const pct = (used: number, max: number | null) => (max && max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('licensing.title')}
        description={t('licensing.description')}
      />

      {!isLive && (
        <Card elevation={1} className="p-4 text-sm text-muted-foreground">
          {t.rich('licensing.liveOnly', {
            code: (chunks) => (
              <code className="rounded bg-anthracite-950/60 px-1.5 py-0.5 text-xs">{chunks}</code>
            ),
          })}
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label={t('licensing.stats.license')}
          value={usage?.licensed ? 1 : 0}
          icon={BadgeCheck}
          primary
          format={() => (usage?.licensed ? (usage?.type ? t(`licensing.types.${usage.type}`) : t('licensing.licensed')) : t('licensing.community'))}
        />
        <StatCard label={t('licensing.stats.concurrentInUse')} value={usage?.usedConcurrent ?? 0} icon={Zap} />
        <StatCard label={t('licensing.stats.namedUsers')} value={usage?.usedSeats ?? 0} icon={Users} />
      </div>

      {usage?.licensed && (
        <Card elevation={1} className="space-y-4 p-5">
          <h2 className="font-display text-lg font-medium">{t('licensing.utilization')}</h2>
          <Meter label={t('licensing.meters.concurrent')} used={usage.usedConcurrent} max={usage.concurrentSessions} pct={pct(usage.usedConcurrent, usage.concurrentSessions)} />
          <Meter label={t('licensing.meters.seats')} used={usage.usedSeats} max={usage.seats} pct={pct(usage.usedSeats, usage.seats)} />
        </Card>
      )}

      <Card elevation={1} className="space-y-4 p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-medium">{t('licensing.licenseKey')}</h2>
          {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        </div>

        <div>
          <label className="text-xs text-muted-foreground">{t('licensing.fields.mode')}</label>
          <div className="mt-1 flex gap-2">
            {(['CONCURRENT', 'NAMED_USER'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setType(m)}
                className={cn(
                  'rounded-md border px-3 py-1.5 text-xs transition-colors',
                  type === m
                    ? 'border-[rgba(212,175,55,0.4)] bg-gold-500/10 text-gold-300'
                    : 'border-border-subtle text-muted-foreground hover:bg-secondary',
                )}
              >
                {t(`licensing.types.${m}`)}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="text-xs text-muted-foreground">{t('licensing.fields.concurrentLimit')}</label>
            <Input type="number" min={1} value={concurrent} onChange={(e) => setConcurrent(Number(e.target.value))} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t('licensing.fields.seats')}</label>
            <Input type="number" min={1} value={seats} onChange={(e) => setSeats(Number(e.target.value))} />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button size="sm" onClick={() => void onSave()} disabled={!isLive || saving}>
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
            {t('licensing.saveLicense')}
          </Button>
          <Badge variant="info">{t('licensing.enforcedAtLaunch')}</Badge>
        </div>
      </Card>
    </div>
  );
}

function Meter({ label, used, max, pct }: { label: string; used: number; max: number | null; pct: number }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="tnum">
          {used} / {max ?? '∞'}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-anthracite-700">
        <div
          className={cn('h-full rounded-full transition-all', pct >= 90 ? 'bg-destructive' : pct >= 70 ? 'bg-warning' : 'bg-gold-500')}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
