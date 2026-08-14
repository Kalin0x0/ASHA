'use client';

import { Copy, Download, Loader2, Send, TerminalSquare } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, Label } from '@/components/ui/input';
import { mintRegistrationToken } from '@/lib/api/endpoints';
import { isLive } from '@/lib/api/mode';

const FILES = [
  { file: 'install.ps1', label: 'install.ps1' },
  { file: 'asha-agent.ps1', label: 'asha-agent.ps1' },
  { file: 'remote-install.ps1', label: 'remote-install.ps1' },
];

function useOrigin() {
  return typeof window !== 'undefined' ? window.location.origin : 'https://asha.example.com';
}

async function copy(text: string, okMsg: string, failMsg: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(okMsg);
  } catch {
    toast.error(failMsg);
  }
}

/**
 * Discoverability + remote deploy for the installable Windows host agent. Shows
 * the local install command, download links, and a "Deploy to hosts by IP"
 * dialog that mints a registration token and builds the ready-to-run remote
 * deploy command (WinRM).
 */
export function AgentInstallCard() {
  const t = useTranslations('infrastructure.agentInstall');
  const origin = useOrigin();
  const [deployOpen, setDeployOpen] = useState(false);
  const localCmd = `powershell -ExecutionPolicy Bypass -File install.ps1 -AshaUrl "${origin}" -Token "<REGISTRATION_TOKEN>" -EnableRdp`;

  return (
    <Card elevation={1} className="p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gold-500/10 text-gold-300">
          <TerminalSquare className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium">{t('title')}</p>
            <Button variant="secondary" size="sm" onClick={() => setDeployOpen(true)}>
              <Send className="size-3.5" /> {t('deployButton')}
            </Button>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t('description')}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code
              dir="ltr"
              className="min-w-0 flex-1 truncate rounded-md border border-border-subtle bg-anthracite-950/60 px-2.5 py-2 font-mono text-[11px] text-muted-foreground"
            >
              {localCmd}
            </code>
            <Button variant="secondary" size="sm" onClick={() => void copy(localCmd, t('copiedToast'), t('clipboardBlockedToast'))}>
              <Copy className="size-3.5" /> {t('copy')}
            </Button>
          </div>

          <p className="mt-2.5 mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {t('downloadTitle')}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {FILES.map(({ file, label }) => (
              <a
                key={file}
                href={`/agent/${file}`}
                download
                className="inline-flex items-center gap-1.5 rounded-md border border-border-subtle bg-[var(--surface-1)] px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-[rgba(212,175,55,0.4)] hover:text-gold-300 ring-gold-focus"
              >
                <Download className="size-3.5" /> {label}
              </a>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {t.rich('filesHint', { code: (chunks) => <code>{chunks}</code> })}
          </p>
        </div>
      </div>

      <DeployDialog open={deployOpen} onOpenChange={setDeployOpen} origin={origin} />
    </Card>
  );
}

function DeployDialog({
  open,
  onOpenChange,
  origin,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  origin: string;
}) {
  const t = useTranslations('infrastructure.agentInstall');
  const [hosts, setHosts] = useState('');
  const [enableRdp, setEnableRdp] = useState(true);
  const [busy, setBusy] = useState(false);
  const [command, setCommand] = useState('');

  const targets = hosts
    .split(/[\s,;]+/)
    .map((h) => h.trim())
    .filter(Boolean);

  const generate = async () => {
    if (targets.length === 0) {
      toast.error(t('deploy.noHostsToast'));
      return;
    }
    setBusy(true);
    try {
      let token = '<REGISTRATION_TOKEN>';
      if (isLive) {
        const minted = await mintRegistrationToken({ name: t('deploy.tokenName', { date: new Date().toISOString().slice(0, 16) }) });
        token = minted.token;
      }
      const rdp = enableRdp ? ' -EnableRdp' : '';
      setCommand(
        `$cred = Get-Credential\n` +
          `./remote-install.ps1 -ComputerName ${targets.join(',')} -AshaUrl "${origin}" -Token "${token}" -Credential $cred${rdp}`,
      );
      if (!isLive) toast.message(t('deploy.demoToast'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('deploy.mintFailedToast'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setCommand('');
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="size-5 text-gold-300" /> {t('deploy.title')}
          </DialogTitle>
          <DialogDescription>
            {t('deploy.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label htmlFor="deploy-hosts">{t('deploy.hostsLabel')}</Label>
            <textarea
              id="deploy-hosts"
              dir="ltr"
              rows={3}
              placeholder={'10.0.0.5\n10.0.0.6'}
              value={hosts}
              onChange={(e) => setHosts(e.target.value)}
              className="min-h-[72px] w-full resize-y rounded-md border border-input bg-[var(--surface-1)] px-3 py-2 font-mono text-sm outline-none ring-gold-focus placeholder:text-muted-foreground/60"
            />
          </div>
          <label className="flex items-center gap-2.5 text-sm">
            <input type="checkbox" checked={enableRdp} onChange={(e) => setEnableRdp(e.target.checked)} className="size-4 accent-gold-500" />
            {t('deploy.enableRdp')}
          </label>

          {command && (
            <div>
              <div className="mb-1 flex items-center justify-between">
                <Label>{t('deploy.commandLabel')}</Label>
                <Button variant="ghost" size="sm" onClick={() => void copy(command, t('copiedToast'), t('clipboardBlockedToast'))}>
                  <Copy className="size-3.5" /> {t('copy')}
                </Button>
              </div>
              <pre dir="ltr" className="overflow-x-auto rounded-md border border-border-subtle bg-anthracite-950/60 p-3 font-mono text-[11px] text-muted-foreground">
                {command}
              </pre>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            {t('deploy.close')}
          </Button>
          <Button size="sm" onClick={() => void generate()} disabled={busy}>
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
            {command ? t('deploy.regenerate') : t('deploy.generate')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
