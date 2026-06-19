'use client';

import { Flag, Loader2, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/composite/page-header';
import { StatCard } from '@/components/composite/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useConfirm } from '@/components/ui/confirm';
import { Input, Label } from '@/components/ui/input';
import {
  type ApiBannerConfig,
  deleteBanner,
  getBanners,
  upsertBanner,
} from '@/lib/api/endpoints';
import { isLive } from '@/lib/api/mode';

const SCOPES = ['WORKSPACE', 'GROUP', 'USER'] as const;

export default function BannersPage() {
  const t = useTranslations('settings');
  const tCommon = useTranslations('common');
  const confirm = useConfirm();
  const [banners, setBanners] = useState<ApiBannerConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [scope, setScope] = useState<(typeof SCOPES)[number]>('WORKSPACE');
  const [refId, setRefId] = useState('');
  const [bannerText, setBannerText] = useState('');
  const [bannerColor, setBannerColor] = useState('#1a1a2e');
  const [watermarkText, setWatermarkText] = useState('');
  const [opacity, setOpacity] = useState(0.15);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    if (!isLive) return;
    setLoading(true);
    try {
      setBanners(await getBanners());
    } catch {
      toast.error(t('banners.toasts.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onSave = async () => {
    if (!bannerText && !watermarkText) {
      toast.error(t('banners.toasts.missingText'));
      return;
    }
    setSaving(true);
    try {
      await upsertBanner({
        scope,
        refId: refId || undefined,
        bannerText: bannerText || undefined,
        bannerColor: bannerText ? bannerColor : undefined,
        watermarkText: watermarkText || undefined,
        watermarkOpacity: opacity,
      });
      toast.success(t('banners.toasts.saved'));
      setBannerText('');
      setWatermarkText('');
      setRefId('');
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('banners.toasts.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (id: string) => {
    const banner = banners.find((b) => b.id === id);
    if (
      !(await confirm({
        title: tCommon('confirm.deleteNamed', {
          name: banner?.bannerText || banner?.watermarkText || t('banners.emptyText'),
        }),
      }))
    )
      return;
    setBusyId(id);
    try {
      await deleteBanner(id);
      toast.success(t('banners.toasts.removed'));
      await refresh();
    } catch {
      toast.error(t('banners.toasts.removeFailed'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('banners.title')}
        description={t('banners.description')}
      />

      {!isLive && (
        <Card elevation={1} className="p-4 text-sm text-muted-foreground">
          {t.rich('banners.liveOnly', {
            code: (chunks) => (
              <code className="rounded bg-anthracite-950/60 px-1.5 py-0.5 text-xs">{chunks}</code>
            ),
          })}
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label={t('banners.stats.configs')} value={banners.length} icon={Flag} primary />
        <StatCard label={t('banners.stats.withWatermark')} value={banners.filter((b) => b.watermarkText).length} icon={Flag} />
      </div>

      <Card elevation={1} className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border-subtle p-4">
          <h2 className="font-display text-lg font-medium">{t('banners.configured')}</h2>
          {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        </div>
        <div className="divide-y divide-border-subtle/60">
          {banners.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">{t('banners.empty')}</p>
          ) : (
            banners.map((b) => (
              <div key={b.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <Flag className="size-4 text-gold-300" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{b.bannerText || b.watermarkText || t('banners.emptyText')}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {t(`banners.scopes.${b.scope}`)}
                    {b.refId ? ` · ${b.refId.slice(0, 10)}` : ''}
                  </p>
                </div>
                {b.bannerText && b.bannerColor && (
                  <span className="rounded px-2 py-0.5 text-[11px] text-white" style={{ background: b.bannerColor }}>
                    {t('banners.badges.banner')}
                  </span>
                )}
                {b.watermarkText && <Badge variant="outline">{t('banners.badges.watermark', { percent: Math.round(b.watermarkOpacity * 100) })}</Badge>}
                <Button variant="ghost" size="icon-sm" disabled={busyId === b.id} onClick={() => void onDelete(b.id)}>
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            ))
          )}
        </div>
      </Card>

      <Card elevation={1} className="space-y-4 p-5">
        <h2 className="font-display text-lg font-medium">{t('banners.addTitle')}</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label>{t('banners.fields.scope')}</Label>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as (typeof SCOPES)[number])}
              className="h-9 w-full rounded-md border border-border-subtle bg-[var(--surface-1)] px-2 text-sm"
            >
              {SCOPES.map((s) => (
                <option key={s} value={s}>
                  {t(`banners.scopes.${s}`)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>{t('banners.fields.targetId')}</Label>
            <Input placeholder={t('banners.placeholders.targetId')} value={refId} onChange={(e) => setRefId(e.target.value)} />
          </div>
          <div>
            <Label>{t('banners.fields.bannerText')}</Label>
            <Input placeholder={t('banners.placeholders.bannerText')} value={bannerText} onChange={(e) => setBannerText(e.target.value)} />
          </div>
          <div>
            <Label>{t('banners.fields.bannerColor')}</Label>
            <div className="flex items-center gap-2">
              <input type="color" value={bannerColor} onChange={(e) => setBannerColor(e.target.value)} className="h-9 w-12 rounded border border-border-subtle bg-transparent" />
              <Input value={bannerColor} onChange={(e) => setBannerColor(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>{t('banners.fields.watermarkText')}</Label>
            <Input placeholder="{{user.email}}" value={watermarkText} onChange={(e) => setWatermarkText(e.target.value)} />
          </div>
          <div>
            <Label>{t('banners.fields.watermarkOpacity', { percent: Math.round(opacity * 100) })}</Label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={opacity}
              onChange={(e) => setOpacity(Number(e.target.value))}
              className="w-full accent-gold-500"
            />
          </div>
        </div>
        <Button size="sm" onClick={() => void onSave()} disabled={!isLive || saving}>
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
          {tCommon('actions.save')}
        </Button>
      </Card>
    </div>
  );
}
