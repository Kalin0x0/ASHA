'use client';

import { Loader2, Palette, Save } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/composite/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { type ApiBranding, getBranding, upsertBranding } from '@/lib/api/endpoints';
import { isLive } from '@/lib/api/mode';

export default function BrandingPage() {
  const [branding, setBranding] = useState<ApiBranding | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    if (!isLive) return;
    setLoading(true);
    try {
      setBranding(await getBranding());
    } catch {
      toast.error('Failed to load branding');
    } finally {
      setLoading(false);
    }
  }, []);

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
      toast.success('Branding saved');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save branding');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Branding"
        description="White-label the portal and login screen with your product name, logo, colors, and custom CSS."
        actions={
          <Button size="sm" onClick={() => void onSave()} disabled={!isLive || saving}>
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
            Save
          </Button>
        }
      />

      {!isLive && (
        <Card elevation={1} className="p-4 text-sm text-muted-foreground">
          Branding is live-backend only. Run with{' '}
          <code className="rounded bg-anthracite-950/60 px-1.5 py-0.5 text-xs">NEXT_PUBLIC_API_MODE=live</code>.
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card elevation={1} className="space-y-4 p-5 lg:col-span-2">
          <div className="flex items-center gap-2">
            <Palette className="size-5 text-gold-300" />
            <h2 className="font-display text-lg font-medium">Identity</h2>
            {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          </div>
          <div>
            <Label>Product name</Label>
            <Input value={b.productName} onChange={(e) => set({ productName: e.target.value })} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label>Logo URL</Label>
              <Input placeholder="https://…/logo.svg" value={b.logoUrl ?? ''} onChange={(e) => set({ logoUrl: e.target.value })} />
            </div>
            <div>
              <Label>Favicon URL</Label>
              <Input placeholder="https://…/favicon.ico" value={b.faviconUrl ?? ''} onChange={(e) => set({ faviconUrl: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <Label>Login background URL</Label>
              <Input placeholder="https://…/bg.jpg" value={b.loginBackgroundUrl ?? ''} onChange={(e) => set({ loginBackgroundUrl: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Primary color</Label>
              <div className="flex items-center gap-2">
                <input type="color" value={b.primaryColor} onChange={(e) => set({ primaryColor: e.target.value })} className="h-9 w-12 rounded border border-border-subtle bg-transparent" />
                <Input value={b.primaryColor} onChange={(e) => set({ primaryColor: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Accent color</Label>
              <div className="flex items-center gap-2">
                <input type="color" value={b.accentColor} onChange={(e) => set({ accentColor: e.target.value })} className="h-9 w-12 rounded border border-border-subtle bg-transparent" />
                <Input value={b.accentColor} onChange={(e) => set({ accentColor: e.target.value })} />
              </div>
            </div>
          </div>
          <div>
            <Label>Custom CSS</Label>
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
          <h2 className="font-display text-lg font-medium">Preview</h2>
          <div className="overflow-hidden rounded-lg border border-border-subtle">
            <div className="flex items-center gap-2 p-4" style={{ background: b.primaryColor }}>
              {b.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={b.logoUrl} alt="logo" className="h-6" />
              ) : (
                <span className="font-display text-lg font-medium text-white">{b.productName}</span>
              )}
            </div>
            <div className="space-y-2 p-4">
              <div className="h-2 w-3/4 rounded-full bg-anthracite-700" />
              <div className="h-2 w-1/2 rounded-full bg-anthracite-700" />
              <button className="mt-2 rounded-md px-3 py-1.5 text-sm font-medium text-anthracite-950" style={{ background: b.accentColor }}>
                Sign in
              </button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
