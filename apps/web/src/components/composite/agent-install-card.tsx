'use client';

import { Copy, Download, Loader2, Send, TerminalSquare } from 'lucide-react';
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
  { file: 'chista-agent.ps1', label: 'chista-agent.ps1' },
  { file: 'remote-install.ps1', label: 'remote-install.ps1' },
];

function useOrigin() {
  return typeof window !== 'undefined' ? window.location.origin : 'https://chista.example.com';
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  } catch {
    toast.error('Clipboard access was blocked');
  }
}

/**
 * Discoverability + remote deploy for the installable Windows host agent. Shows
 * the local install command, download links, and a "Deploy to hosts by IP"
 * dialog that mints a registration token and builds the ready-to-run remote
 * deploy command (WinRM). Inline EN to match this admin page.
 */
export function AgentInstallCard() {
  const origin = useOrigin();
  const [deployOpen, setDeployOpen] = useState(false);
  const localCmd = `powershell -ExecutionPolicy Bypass -File install.ps1 -ChistaUrl "${origin}" -Token "<REGISTRATION_TOKEN>" -EnableRdp`;

  return (
    <Card elevation={1} className="p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gold-500/10 text-gold-300">
          <TerminalSquare className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium">Install the Windows agent</p>
            <Button variant="secondary" size="sm" onClick={() => setDeployOpen(true)}>
              <Send className="size-3.5" /> Deploy to hosts by IP
            </Button>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Run this on a Windows desktop/server (admin PowerShell) to auto-register it and keep it Online.
            Generate a registration token under Access → Authentication first.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code
              dir="ltr"
              className="min-w-0 flex-1 truncate rounded-md border border-border-subtle bg-anthracite-950/60 px-2.5 py-2 font-mono text-[11px] text-muted-foreground"
            >
              {localCmd}
            </code>
            <Button variant="secondary" size="sm" onClick={() => void copy(localCmd)}>
              <Copy className="size-3.5" /> Copy
            </Button>
          </div>

          <p className="mt-2.5 mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Download the agent
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
            <code>install.ps1</code> = install on this machine · <code>remote-install.ps1</code> = push to other
            hosts by IP (WinRM).
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
      toast.error('Enter at least one host IP or name.');
      return;
    }
    setBusy(true);
    try {
      let token = '<REGISTRATION_TOKEN>';
      if (isLive) {
        const minted = await mintRegistrationToken({ name: `Agent deploy ${new Date().toISOString().slice(0, 16)}` });
        token = minted.token;
      }
      const rdp = enableRdp ? ' -EnableRdp' : '';
      setCommand(
        `$cred = Get-Credential\n` +
          `./remote-install.ps1 -ComputerName ${targets.join(',')} -ChistaUrl "${origin}" -Token "${token}" -Credential $cred${rdp}`,
      );
      if (!isLive) toast.message('Demo mode — token is a placeholder. Connect the live API to mint a real one.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not mint a registration token.');
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
            <Send className="size-5 text-gold-300" /> Deploy agent to hosts by IP
          </DialogTitle>
          <DialogDescription>
            Generates a remote-deploy command (PowerShell Remoting / WinRM) that installs the agent on the hosts
            you list — run it from a Windows admin box that can reach them. WinRM must be enabled on the targets.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label htmlFor="deploy-hosts">Target hosts (IP or hostname, one per line or comma-separated)</Label>
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
            Enable Remote Desktop on each host
          </label>

          {command && (
            <div>
              <div className="mb-1 flex items-center justify-between">
                <Label>Run this from a Windows admin box</Label>
                <Button variant="ghost" size="sm" onClick={() => void copy(command)}>
                  <Copy className="size-3.5" /> Copy
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
            Close
          </Button>
          <Button size="sm" onClick={() => void generate()} disabled={busy}>
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
            {command ? 'Regenerate' : 'Generate command'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
