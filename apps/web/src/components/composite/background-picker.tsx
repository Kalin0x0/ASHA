'use client';

import { Check, Image as ImageIcon, RotateCcw, Wallpaper, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { BACKGROUNDS } from '@/lib/backgrounds';
import { useBackground } from '@/lib/background-store';
import { cn } from '@/lib/utils';

/**
 * Launcher wallpaper picker — a Kasm-style "change your background" control that
 * lives in the portal topbar. Opens a popover of live preset swatches plus a
 * custom-image-URL field; the choice persists per browser (background-store).
 */
export function BackgroundPicker() {
  const t = useTranslations('portal');
  const presetId = useBackground((s) => s.presetId);
  const customImageUrl = useBackground((s) => s.customImageUrl);
  const setPreset = useBackground((s) => s.setPreset);
  const setCustomImage = useBackground((s) => s.setCustomImage);
  const reset = useBackground((s) => s.reset);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [url, setUrl] = useState('');

  const activeId = mounted ? presetId : 'aurora';
  const hasCustom = mounted && !!customImageUrl;
  const isDefault = !hasCustom && activeId === 'aurora';

  const applyPreset = (id: string) => {
    setPreset(id);
    toast.success(t('appearance.appliedToast', { name: t(`appearance.presets.${id}`) }));
  };

  const applyCustom = () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    setCustomImage(trimmed);
    toast.success(t('appearance.customAppliedToast'));
  };

  const removeCustom = () => {
    setCustomImage(null);
    setUrl('');
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={t('appearance.trigger')} title={t('appearance.trigger')}>
          <Wallpaper className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent>
        <div className="mb-2.5 flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-medium">{t('appearance.title')}</p>
            <p className="text-[11px] leading-snug text-muted-foreground">{t('appearance.subtitle')}</p>
          </div>
          {!isDefault && (
            <button
              type="button"
              onClick={reset}
              className="inline-flex shrink-0 items-center gap-1 rounded px-1 text-[11px] font-medium text-gold-300 ring-gold-focus hover:text-gold-200"
            >
              <RotateCcw className="size-3" /> {t('appearance.reset')}
            </button>
          )}
        </div>

        {/* Preset swatches — each renders the exact background it applies */}
        <div className="grid grid-cols-4 gap-2">
          {BACKGROUNDS.map((bg) => {
            const active = !hasCustom && activeId === bg.id;
            return (
              <button
                key={bg.id}
                type="button"
                onClick={() => applyPreset(bg.id)}
                aria-label={t(`appearance.presets.${bg.id}`)}
                aria-pressed={active}
                title={t(`appearance.presets.${bg.id}`)}
                className={cn(
                  'group relative aspect-square overflow-hidden rounded-lg border bg-anthracite-950 transition-all ring-gold-focus',
                  active
                    ? 'border-gold-500/70 shadow-[0_0_0_1px_rgba(212,175,55,0.5)]'
                    : 'border-white/10 hover:-translate-y-0.5 hover:border-white/30',
                )}
              >
                <span
                  className="absolute inset-0 bg-cover bg-center"
                  style={
                    bg.src
                      ? { backgroundImage: `url('${bg.src}')` }
                      : { backgroundImage: bg.image, backgroundSize: '160% 160%', backgroundPosition: 'center' }
                  }
                />
                {active && (
                  <span className="absolute inset-0 flex items-center justify-center bg-anthracite-950/25">
                    <Check className="size-4 text-gold-200 drop-shadow" />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Custom image URL */}
        <div className="mt-3 border-t border-border-subtle pt-3">
          <label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            <ImageIcon className="size-3.5" /> {t('appearance.customLabel')}
          </label>
          <div className="flex items-center gap-1.5">
            <input
              type="url"
              inputMode="url"
              dir="ltr"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') applyCustom();
              }}
              placeholder="https://…/wallpaper.jpg"
              className="h-8 min-w-0 flex-1 rounded-md border border-border-subtle bg-[var(--surface-1)] px-2.5 text-xs outline-none ring-gold-focus placeholder:text-muted-foreground/50"
            />
            <button
              type="button"
              onClick={applyCustom}
              disabled={!url.trim()}
              className="h-8 shrink-0 rounded-md bg-gold-500/90 px-3 text-xs font-medium text-anthracite-950 ring-gold-focus transition-colors hover:bg-gold-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t('appearance.apply')}
            </button>
          </div>
          {hasCustom && (
            <button
              type="button"
              onClick={removeCustom}
              className="mt-2 inline-flex items-center gap-1 rounded text-[11px] text-muted-foreground ring-gold-focus hover:text-foreground"
            >
              <X className="size-3" /> {t('appearance.removeCustom')}
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
