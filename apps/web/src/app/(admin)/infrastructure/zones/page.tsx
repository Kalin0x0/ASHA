'use client';

import { Globe, Loader2, Plus, Star, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/composite/empty-state';
import { PageHeader } from '@/components/composite/page-header';
import { StatCard } from '@/components/composite/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import {
  type ApiZone,
  createZone,
  deleteZone,
  getZones,
  updateZone,
} from '@/lib/api/endpoints';
import { isLive } from '@/lib/api/mode';

export default function ZonesPage() {
  const t = useTranslations('infrastructure');
  const tc = useTranslations('common');
  const [zones, setZones] = useState<ApiZone[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [region, setRegion] = useState('');
  const [proxyBaseUrl, setProxyBaseUrl] = useState('');
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    if (!isLive) return;
    setLoading(true);
    try {
      setZones(await getZones());
    } catch {
      toast.error(t('zones.toasts.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onCreate = async () => {
    if (!name) return;
    setCreating(true);
    try {
      await createZone({ name, region: region || undefined, proxyBaseUrl: proxyBaseUrl || undefined });
      toast.success(t('zones.toasts.created'));
      setName('');
      setRegion('');
      setProxyBaseUrl('');
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('zones.toasts.createFailed'));
    } finally {
      setCreating(false);
    }
  };

  const onSetDefault = async (z: ApiZone) => {
    setBusyId(z.id);
    try {
      await updateZone(z.id, { isDefault: true });
      await refresh();
    } catch {
      toast.error(t('zones.toasts.setDefaultFailed'));
    } finally {
      setBusyId(null);
    }
  };

  const onDelete = async (id: string) => {
    setBusyId(id);
    try {
      await deleteZone(id);
      toast.success(t('zones.toasts.removed'));
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('zones.toasts.removeFailed'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('zones.title')}
        description={t('zones.description')}
      />

      {!isLive && (
        <Card elevation={1} className="p-4 text-sm text-muted-foreground">
          {t.rich('zones.liveOnly', {
            code: (chunks) => (
              <code className="rounded bg-anthracite-950/60 px-1.5 py-0.5 text-xs">{chunks}</code>
            ),
          })}
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label={t('zones.stats.zones')} value={zones.length} icon={Globe} primary />
        <StatCard label={t('zones.stats.regions')} value={new Set(zones.map((z) => z.region).filter(Boolean)).size} icon={Globe} />
      </div>

      <Card elevation={1} className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border-subtle p-4">
          <h2 className="font-display text-lg font-medium">{t('zones.configuredZones')}</h2>
          {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        </div>
        <div className="divide-y divide-border-subtle/60">
          {zones.length === 0 ? (
            <EmptyState icon={Globe} title={t('zones.empty.title')} description={t('zones.empty.description')} />
          ) : (
            zones.map((z) => (
              <div key={z.id} className="flex items-center gap-3 px-5 py-3 text-sm transition-all duration-150 hover:bg-gold-500/[0.05] hover:shadow-[inset_2px_0_0_rgba(212,175,55,0.55)]">
                <Globe className="size-4 text-gold-300" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{z.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{z.proxyBaseUrl ?? z.region ?? '—'}</p>
                </div>
                {z.region && <Badge variant="outline">{z.region}</Badge>}
                {z.isDefault ? (
                  <Badge variant="gold">{t('zones.default')}</Badge>
                ) : (
                  <Button variant="ghost" size="icon-sm" title={t('zones.setDefault')} disabled={busyId === z.id} onClick={() => void onSetDefault(z)}>
                    <Star className="size-4" />
                  </Button>
                )}
                <Button variant="ghost" size="icon-sm" disabled={busyId === z.id} onClick={() => void onDelete(z.id)}>
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            ))
          )}
        </div>
      </Card>

      <Card elevation={1} className="space-y-4 p-5">
        <h2 className="font-display text-lg font-medium">{t('zones.addZone')}</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <Label>{tc('labels.name')}</Label>
            <Input placeholder="eu-central" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>{t('zones.form.region')}</Label>
            <Input placeholder={t('zones.form.regionPlaceholder')} value={region} onChange={(e) => setRegion(e.target.value)} />
          </div>
          <div>
            <Label>{t('zones.form.proxyBaseUrl')}</Label>
            <Input placeholder="https://eu.chista.local" value={proxyBaseUrl} onChange={(e) => setProxyBaseUrl(e.target.value)} />
          </div>
        </div>
        <Button size="sm" onClick={() => void onCreate()} disabled={!isLive || !name || creating}>
          {creating ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
          {t('zones.addZone')}
        </Button>
      </Card>
    </div>
  );
}
