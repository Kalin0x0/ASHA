'use client';

import { Download, ExternalLink, Globe, Loader2, Monitor, Play } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AppIcon } from '@/components/composite/app-icon';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { RdpFileOptions } from '@/lib/api/endpoints';
import { useDownloadRdp } from '@/lib/hooks';
import type { Workspace } from '@/lib/types';
import { cn } from '@/lib/utils';

type Mode = 'web' | 'web-tab' | 'rdp';

const FIELD =
  'h-10 w-full rounded-md border border-border-subtle bg-[var(--surface-1)] px-3 text-sm outline-none ring-gold-focus';

export function LaunchDialog({
  workspace,
  open,
  onOpenChange,
  onWebNative,
  onWebNewTab,
  launching = false,
}: {
  workspace: Workspace | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onWebNative: (workspace: Workspace) => void;
  /** Launch the web viewer in a separate browser tab. `win` is pre-opened
   *  synchronously on click so the pop-up isn't blocked; the caller navigates it
   *  to the session URL once the launch resolves (or closes it on failure). */
  onWebNewTab: (workspace: Workspace, win: Window | null) => void;
  launching?: boolean;
}) {
  const t = useTranslations('portal.openIn');
  const tc = useTranslations('common');
  const downloadRdp = useDownloadRdp();
  const rdpCapable = workspace?.protocol === 'RDP';

  const [mode, setMode] = useState<Mode>('web');
  const [opts, setOpts] = useState<Required<RdpFileOptions>>({
    multimon: true,
    clipboard: true,
    drives: true,
    printers: true,
  });
  const [downloading, setDownloading] = useState(false);

  // Reset to the default choice whenever a new workspace dialog opens.
  useEffect(() => {
    if (open) {
      setMode('web');
      setOpts({ multimon: true, clipboard: true, drives: true, printers: true });
    }
  }, [open]);

  if (!workspace) return null;

  const onDownload = async () => {
    setDownloading(true);
    try {
      await downloadRdp(workspace, opts);
      toast.success(t('downloaded'), { description: t('downloadedHint') });
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('downloadError'));
    } finally {
      setDownloading(false);
    }
  };

  const toggles: Array<{ key: keyof RdpFileOptions; label: string; hint: string }> = [
    { key: 'multimon', label: t('multimon'), hint: t('multimonHint') },
    { key: 'clipboard', label: t('clipboard'), hint: t('clipboardHint') },
    { key: 'drives', label: t('drives'), hint: t('drivesHint') },
    { key: 'printers', label: t('printers'), hint: t('printersHint') },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <AppIcon
              name={workspace.friendlyName}
              dockerImage={workspace.dockerImage}
              category={workspace.category}
              iconUrl={workspace.iconUrl}
              rounded="rounded-xl"
              className="size-12 shrink-0"
            />
            <div className="min-w-0">
              <DialogTitle className="truncate">{t('title', { name: workspace.friendlyName })}</DialogTitle>
              <DialogDescription className="truncate">
                {workspace.serverName ? `${workspace.serverName} · ${workspace.protocol}` : workspace.category}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* Open Session In */}
          <div>
            <label htmlFor="open-in" className="mb-1.5 block text-xs font-medium tracking-wide text-muted-foreground">
              {t('label')}
            </label>
            <select
              id="open-in"
              className={FIELD}
              value={mode}
              onChange={(e) => setMode(e.target.value as Mode)}
            >
              <option value="web">{t('webNative')}</option>
              <option value="web-tab">{t('webNewTab')}</option>
              {rdpCapable && <option value="rdp">{t('rdpClient')}</option>}
            </select>
            <p className="mt-1.5 flex items-start gap-1.5 text-[12px] text-muted-foreground">
              {mode === 'web' ? (
                <Globe className="mt-0.5 size-3.5 shrink-0" />
              ) : mode === 'web-tab' ? (
                <ExternalLink className="mt-0.5 size-3.5 shrink-0" />
              ) : (
                <Monitor className="mt-0.5 size-3.5 shrink-0" />
              )}
              <span>
                {mode === 'web' ? t('webNativeHint') : mode === 'web-tab' ? t('webNewTabHint') : t('rdpClientHint')}
              </span>
            </p>
          </div>

          {/* RDP client options */}
          {mode === 'rdp' && (
            <div className="space-y-2 rounded-lg border border-border-subtle bg-anthracite-950/30 p-3">
              <p className="text-xs font-medium text-foreground">{t('options')}</p>
              {toggles.map(({ key, label, hint }) => (
                <label key={key} className="flex items-start gap-2.5 text-sm">
                  <input
                    type="checkbox"
                    checked={opts[key]}
                    onChange={(e) => setOpts((o) => ({ ...o, [key]: e.target.checked }))}
                    className="mt-0.5 size-4 shrink-0 accent-gold-500"
                  />
                  <span>
                    <span className="block font-medium">{label}</span>
                    <span className="block text-[11px] text-muted-foreground">{hint}</span>
                  </span>
                </label>
              ))}
              <p className="pt-1 text-[11px] text-muted-foreground">{t('rdpReachabilityHint')}</p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-1">
          <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            {tc('actions.cancel')}
          </Button>
          {mode === 'rdp' ? (
            <Button type="button" size="sm" disabled={downloading} onClick={() => void onDownload()}>
              {downloading ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
              {t('download')}
            </Button>
          ) : mode === 'web-tab' ? (
            <Button
              type="button"
              size="sm"
              disabled={launching}
              // Open the blank tab synchronously inside the click so the browser
              // treats it as user-initiated (not a blocked pop-up); the caller
              // points it at the session once the launch resolves.
              onClick={() => onWebNewTab(workspace, window.open('', '_blank'))}
            >
              {launching ? <Loader2 className="size-3.5 animate-spin" /> : <ExternalLink className="size-3.5" />}
              {t('launch')}
            </Button>
          ) : (
            <Button type="button" size="sm" disabled={launching} onClick={() => onWebNative(workspace)}>
              {launching ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
              {t('launch')}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
