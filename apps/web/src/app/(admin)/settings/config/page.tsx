'use client';

import { Download, FileJson, Loader2, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/composite/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { exportConfig, importConfig } from '@/lib/api/endpoints';
import { isLive } from '@/lib/api/mode';

export default function ConfigPage() {
  const t = useTranslations('settings');
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [payload, setPayload] = useState('');

  const onExport = async () => {
    setExporting(true);
    try {
      const config = await exportConfig();
      const json = JSON.stringify(config, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `asha-config-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setPayload(json);
      toast.success(t('config.toasts.exported'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('config.toasts.exportFailed'));
    } finally {
      setExporting(false);
    }
  };

  const onImport = async () => {
    let parsed: { branding?: unknown; settings?: unknown };
    try {
      parsed = JSON.parse(payload);
    } catch {
      toast.error(t('config.toasts.invalidJson'));
      return;
    }
    setImporting(true);
    try {
      await importConfig({
        branding: parsed.branding as Record<string, never> | undefined,
        settings: parsed.settings as { key: string; value: unknown }[] | undefined,
      });
      toast.success(t('config.toasts.imported'), { description: t('config.toasts.importedDescription') });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('config.toasts.importFailed'));
    } finally {
      setImporting(false);
    }
  };

  const onFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => setPayload(String(reader.result ?? ''));
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('config.title')}
        description={t('config.description')}
      />

      {!isLive && (
        <Card elevation={1} className="p-4 text-sm text-muted-foreground">
          {t.rich('config.liveOnly', {
            code: (chunks) => (
              <code className="rounded bg-anthracite-950/60 px-1.5 py-0.5 text-xs">{chunks}</code>
            ),
          })}
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card elevation={1} className="space-y-3 p-5">
          <div className="flex items-center gap-2">
            <Download className="size-5 text-gold-300" />
            <h2 className="font-display text-lg font-medium">{t('config.export')}</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            {t('config.exportHint')}
          </p>
          <Button size="sm" onClick={() => void onExport()} disabled={!isLive || exporting}>
            {exporting ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
            {t('config.exportConfig')}
          </Button>
        </Card>

        <Card elevation={1} className="space-y-3 p-5">
          <div className="flex items-center gap-2">
            <Upload className="size-5 text-gold-300" />
            <h2 className="font-display text-lg font-medium">{t('config.import')}</h2>
          </div>
          <p className="text-sm text-muted-foreground">{t('config.importHint')}</p>
          <input
            type="file"
            accept="application/json"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
            }}
            className="block w-full text-xs text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-xs"
          />
          <Button size="sm" onClick={() => void onImport()} disabled={!isLive || importing || !payload.trim()}>
            {importing ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
            {t('config.importConfig')}
          </Button>
        </Card>
      </div>

      <Card elevation={1} className="space-y-2 p-5">
        <div className="flex items-center gap-2">
          <FileJson className="size-5 text-gold-300" />
          <h2 className="font-display text-lg font-medium">{t('config.payload')}</h2>
        </div>
        <textarea
          value={payload}
          onChange={(e) => setPayload(e.target.value)}
          rows={16}
          placeholder='{ "branding": { … }, "settings": [ { "key": "…", "value": … } ] }'
          className="w-full rounded-md border border-border-subtle bg-[var(--surface-1)] p-3 font-mono text-xs"
        />
      </Card>
    </div>
  );
}
