'use client';

import { Bug, ImageUp, Loader2, MessageSquarePlus, Send, Sparkles, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/input';
import { useCreateFeedback } from '@/lib/hooks';
import type { FeedbackKind } from '@/lib/types';
import { cn } from '@/lib/utils';

/**
 * Downscale + re-encode an image file/blob to a compact JPEG data URL so the
 * screenshot stays well under the API's 8 MB cap. Falls back to the raw data
 * URL if the canvas pipeline is unavailable.
 */
async function toCompactDataUrl(file: Blob, maxEdge = 1600, quality = 0.82): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('read-failed'));
    reader.readAsDataURL(file);
  });
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('decode-failed'));
      el.src = dataUrl;
    });
    const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', quality);
  } catch {
    return dataUrl;
  }
}

const TEXTAREA =
  'min-h-[110px] w-full resize-y rounded-md border border-input bg-[var(--surface-1)] px-3 py-2 text-sm transition-shadow placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:border-[rgba(212,175,55,0.5)] focus-visible:shadow-[var(--gold-glow)]';

export function FeedbackWidget() {
  const t = useTranslations('feedback');
  const tc = useTranslations('common');
  const pathname = usePathname();
  const createFeedback = useCreateFeedback();
  const fileRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<FeedbackKind>('BUG');
  const [message, setMessage] = useState('');
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setKind('BUG');
    setMessage('');
    setScreenshot(null);
  };

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) reset();
  };

  const ingest = async (file: Blob | undefined | null) => {
    if (!file) return;
    try {
      const url = await toCompactDataUrl(file);
      // Hard guard against the 8 MB schema cap (data URLs are ~33% larger than bytes).
      if (url.length > 7_500_000) {
        toast.error(t('widget.imageTooLarge'));
        return;
      }
      setScreenshot(url);
    } catch {
      toast.error(t('widget.imageFailed'));
    }
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith('image/'));
    if (item) {
      e.preventDefault();
      void ingest(item.getAsFile());
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = message.trim();
    if (!body) {
      toast.error(t('widget.messageRequired'));
      return;
    }
    setSubmitting(true);
    try {
      await createFeedback({
        kind,
        message: body,
        pageUrl: pathname || undefined,
        screenshot: kind === 'BUG' ? screenshot ?? undefined : undefined,
      });
      toast.success(t('widget.sent'), { description: t('widget.sentHint') });
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('widget.failed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('widget.open')}
        title={t('widget.open')}
        className="group fixed bottom-5 end-5 z-40 flex size-12 items-center justify-center rounded-full border border-[rgba(212,175,55,0.35)] bg-anthracite-900/90 text-gold-300 shadow-[var(--shadow-lifted)] backdrop-blur transition-all hover:scale-105 hover:border-[rgba(212,175,55,0.6)] hover:shadow-[var(--gold-glow)] ring-gold-focus"
      >
        <MessageSquarePlus className="size-5 transition-transform group-hover:-rotate-6" />
      </button>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md" onPaste={onPaste}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="size-5 text-gold-300" /> {t('widget.title')}
            </DialogTitle>
            <DialogDescription>{t('widget.description')}</DialogDescription>
          </DialogHeader>

          <form onSubmit={onSubmit} className="space-y-3.5">
            {/* Kind toggle */}
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { v: 'BUG' as const, icon: Bug, label: t('kind.BUG'), hint: t('widget.bugHint') },
                  { v: 'FEEDBACK' as const, icon: MessageSquarePlus, label: t('kind.FEEDBACK'), hint: t('widget.feedbackHint') },
                ]
              ).map(({ v, icon: Icon, label, hint }) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setKind(v)}
                  className={cn(
                    'flex items-start gap-2.5 rounded-lg border p-3 text-start transition-colors ring-gold-focus',
                    kind === v ? 'border-gold-500/60 bg-gold-500/10' : 'border-border-subtle hover:border-white/25',
                  )}
                >
                  <Icon className={cn('mt-0.5 size-4 shrink-0', kind === v ? 'text-gold-300' : 'text-muted-foreground')} />
                  <span>
                    <span className="block text-sm font-medium">{label}</span>
                    <span className="block text-[11px] text-muted-foreground">{hint}</span>
                  </span>
                </button>
              ))}
            </div>

            <div>
              <Label htmlFor="fb-message">{t('widget.message')}</Label>
              <textarea
                id="fb-message"
                autoFocus
                className={TEXTAREA}
                placeholder={kind === 'BUG' ? t('widget.bugPlaceholder') : t('widget.feedbackPlaceholder')}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>

            {/* Screenshot — bug reports only */}
            {kind === 'BUG' && (
              <div>
                <Label>{t('widget.screenshot')}</Label>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    void ingest(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
                {screenshot ? (
                  <div className="relative overflow-hidden rounded-lg border border-border-subtle">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={screenshot} alt={t('widget.screenshot')} className="max-h-44 w-full object-contain bg-anthracite-950/60" />
                    <button
                      type="button"
                      onClick={() => setScreenshot(null)}
                      aria-label={tc('actions.remove')}
                      className="absolute end-2 top-2 rounded-md bg-anthracite-950/80 p-1 text-muted-foreground hover:text-foreground ring-gold-focus"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border-subtle px-3 py-4 text-sm text-muted-foreground transition-colors hover:border-white/30 hover:text-foreground ring-gold-focus"
                  >
                    <ImageUp className="size-4" /> {t('widget.attach')}
                  </button>
                )}
                <p className="mt-1 text-[11px] text-muted-foreground">{t('widget.pasteHint')}</p>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                {tc('actions.cancel')}
              </Button>
              <Button type="submit" size="sm" disabled={submitting}>
                {submitting ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                {t('widget.submit')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
