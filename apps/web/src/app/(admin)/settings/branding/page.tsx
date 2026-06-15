'use client';

import { Loader2, Palette, Save } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/composite/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { type ApiBranding, getBranding, upsertBranding } from '@/lib/api/endpoints';
import { isLive } from '@/lib/api/mode';

export default function BrandingPage() {
  const t = useTranslations('settings');
  const tCommon = useTranslations('common');
  const [branding, setBranding] = useState<ApiBranding | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    if (!isLive) return;
    setLoading(true);
    try {
      setBranding(await getBranding());
    } catch {
      toast.error(t('branding.toasts.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const b = branding ?? {
    productName: 'Chista',
    logoUrl: null,
    faviconUrl: null,
    loginBackgroundUrl: null,
    primaryColor: '#1a1a2e',
    accentColor: '#d4af37',
    customCss: null,
  };

  const set = (patch: Partial<ApiBranding>) => setBranding({ ...b, ...patch });

  const onSave = async () => {
    setSaving(true);
    try {
      const saved = await upsertBranding({
        productName: b.productName,
        logoUrl: b.logoUrl ?? '',
        faviconUrl: b.faviconUrl ?? '',
        loginBackgroundUrl: b.loginBackgroundUrl ?? '',
        primaryColor: b.primaryColor,
        accentColor: b.accentColor,
        customCss: b.customCss ?? '',
      });
      setBranding(saved);
      toast.success(t('branding.toasts.saved'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('branding.toasts.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('branding.title')}
        description={t('branding.description')}
        actions={
          <Button size="sm" onClick={() => void onSave()} disabled={!isLive || saving}>
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
            {tCommon('actions.save')}
          </Button>
        }
      />

      {!isLive && (
        <Card elevation={1} className="p-4 text-sm text-muted-foreground">
          {t.rich('branding.liveOnly', {
            code: (chunks) => (
              <code className="rounded bg-anthracite-950/60 px-1.5 py-0.5 text-xs">{chunks}</code>
            ),
          })}
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card elevation={1} className="space-y-4 p-5 lg:col-span-2">
          <div className="flex items-center gap-2">
            <Palette className="size-5 text-gold-300" />
            <h2 className="font-display text-lg font-medium">{t('branding.identity')}</h2>
            {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          </div>
          <div>
            <Label>{t('branding.fields.productName')}</Label>
            <Input value={b.productName} onChange={(e) => set({ productName: e.target.value })} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label>{t('branding.fields.logoUrl')}</Label>
              <Input placeholder="https://…/logo.svg" value={b.logoUrl ?? ''} onChange={(e) => set({ logoUrl: e.target.value })} />
            </div>
            <div>
              <Label>{t('branding.fields.faviconUrl')}</Label>
              <Input placeholder="https://…/favicon.ico" value={b.faviconUrl ?? ''} onChange={(e) => set({ faviconUrl: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <Label>{t('branding.fields.loginBackgroundUrl')}</Label>
              <Input placeholder="https://…/bg.jpg" value={b.loginBackgroundUrl ?? ''} onChange={(e) => set({ loginBackgroundUrl: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t('branding.fields.primaryColor')}</Label>
              <div className="flex items-center gap-2">
                <input type="color" value={b.primaryColor} onChange={(e) => set({ primaryColor: e.target.value })} className="h-9 w-12 rounded border border-border-subtle bg-transparent" />
                <Input value={b.primaryColor} onChange={(e) => set({ primaryColor: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>{t('branding.fields.accentColor')}</Label>
              <div className="flex items-center gap-2">
                <input type="color" value={b.accentColor} onChange={(e) => set({ accentColor: e.target.value })} className="h-9 w-12 rounded border border-border-subtle bg-transparent" />
                <Input value={b.accentColor} onChange={(e) => set({ accentColor: e.target.value })} />
              </div>
            </div>
          </div>
          <div>
            <Label>{t('branding.fields.customCss')}</Label>
            <textarea
              value={b.customCss ?? ''}
              onChange={(e) => set({ customCss: e.target.value })}
              rows={6}
              placeholder=":root { --brand: #d4af37; }"
              className="w-full rounded-md border border-border-subtle bg-[var(--surface-1)] p-2 font-mono text-xs"
            />
          </div>
        </Card>

        <Card elevation={1} className="space-y-4 p-5">
          <h2 className="font-display text-lg font-medium">{t('branding.preview')}</h2>
          <div className="overflow-hidden rounded-lg border border-border-subtle">
            <div className="flex items-center gap-2 p-4" style={{ background: b.primaryColor }}>
              {b.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={b.logoUrl} alt={t('branding.logoAlt')} className="h-6" />
              ) : (
                <span className="font-display text-lg font-medium text-white">{b.productName}</span>
              )}
            </div>
            <div className="space-y-2 p-4">
              <div className="h-2 w-3/4 rounded-full bg-anthracite-700" />
              <div className="h-2 w-1/2 rounded-full bg-anthracite-700" />
              <button className="mt-2 rounded-md px-3 py-1.5 text-sm font-medium text-anthracite-950" style={{ background: b.accentColor }}>
                {t('branding.signIn')}
              </button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
