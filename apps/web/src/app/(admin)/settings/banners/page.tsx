'use client';

import { Flag, Loader2, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/composite/page-header';
import { StatCard } from '@/components/composite/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
      toast.error('Failed to load banners');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onSave = async () => {
    if (!bannerText && !watermarkText) {
      toast.error('Provide a banner text or watermark text');
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
      toast.success('Banner / watermark saved');
      setBannerText('');
      setWatermarkText('');
      setRefId('');
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (id: string) => {
    setBusyId(id);
    try {
      await deleteBanner(id);
      toast.success('Removed');
      await refresh();
    } catch {
      toast.error('Could not remove');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Banners"
        description="Compliance banners and forensic watermarks shown over sessions, scoped to a workspace, group, or user."
      />

      {!isLive && (
        <Card elevation={1} className="p-4 text-sm text-muted-foreground">
          Banners are live-backend only. Run with{' '}
          <code className="rounded bg-anthracite-950/60 px-1.5 py-0.5 text-xs">NEXT_PUBLIC_API_MODE=live</code>.
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label="Configs" value={banners.length} icon={Flag} primary />
        <StatCard label="With watermark" value={banners.filter((b) => b.watermarkText).length} icon={Flag} />
      </div>

      <Card elevation={1} className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border-subtle p-4">
          <h2 className="font-display text-lg font-medium">Configured</h2>
          {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        </div>
        <div className="divide-y divide-border-subtle/60">
          {banners.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">No banner or watermark configs yet.</p>
          ) : (
            banners.map((b) => (
              <div key={b.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <Flag className="size-4 text-gold-300" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{b.bannerText || b.watermarkText || '(empty)'}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {b.scope}
                    {b.refId ? ` · ${b.refId.slice(0, 10)}` : ''}
                  </p>
                </div>
                {b.bannerText && b.bannerColor && (
                  <span className="rounded px-2 py-0.5 text-[11px] text-white" style={{ background: b.bannerColor }}>
                    banner
                  </span>
                )}
                {b.watermarkText && <Badge variant="outline">watermark {Math.round(b.watermarkOpacity * 100)}%</Badge>}
                <Button variant="ghost" size="icon-sm" disabled={busyId === b.id} onClick={() => void onDelete(b.id)}>
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            ))
          )}
        </div>
      </Card>

      <Card elevation={1} className="space-y-4 p-5">
        <h2 className="font-display text-lg font-medium">Add banner / watermark</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label>Scope</Label>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as (typeof SCOPES)[number])}
              className="h-9 w-full rounded-md border border-border-subtle bg-[var(--surface-1)] px-2 text-sm"
            >
              {SCOPES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Target ID (optional — blank = all in scope)</Label>
            <Input placeholder="workspace/group/user id" value={refId} onChange={(e) => setRefId(e.target.value)} />
          </div>
          <div>
            <Label>Banner text</Label>
            <Input placeholder="AUTHORIZED USE ONLY" value={bannerText} onChange={(e) => setBannerText(e.target.value)} />
          </div>
          <div>
            <Label>Banner color</Label>
            <div className="flex items-center gap-2">
              <input type="color" value={bannerColor} onChange={(e) => setBannerColor(e.target.value)} className="h-9 w-12 rounded border border-border-subtle bg-transparent" />
              <Input value={bannerColor} onChange={(e) => setBannerColor(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Watermark text</Label>
            <Input placeholder="{{user.email}}" value={watermarkText} onChange={(e) => setWatermarkText(e.target.value)} />
          </div>
          <div>
            <Label>Watermark opacity ({Math.round(opacity * 100)}%)</Label>
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
          Save
        </Button>
      </Card>
    </div>
  );
}
