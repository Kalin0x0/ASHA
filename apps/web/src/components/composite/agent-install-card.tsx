'use client';

import { Copy, TerminalSquare } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

/**
 * Discoverability for the installable Windows host agent: shows the one-line
 * PowerShell install command (with this deployment's URL filled in) so an admin
 * can auto-register a Windows desktop and keep it Online. (Strings are inline EN
 * to match this admin page, which isn't routed through the i18n catalogs yet.)
 */
export function AgentInstallCard() {
  const [copied, setCopied] = useState(false);
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://chista.example.com';
  const cmd = `powershell -ExecutionPolicy Bypass -File install.ps1 -ChistaUrl "${origin}" -Token "<REGISTRATION_TOKEN>" -EnableRdp`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(cmd);
      setCopied(true);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Clipboard access was blocked');
    }
  };

  return (
    <Card elevation={1} className="p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gold-500/10 text-gold-300">
          <TerminalSquare className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium">Install the Windows agent</p>
          <p className="text-sm text-muted-foreground">
            Run this on a Windows desktop/server (admin PowerShell) to auto-register it and keep it Online.
            Generate a registration token under Access → Authentication first, then paste it in place of{' '}
            <code className="text-[11px]">&lt;REGISTRATION_TOKEN&gt;</code>.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code
              dir="ltr"
              className="min-w-0 flex-1 truncate rounded-md border border-border-subtle bg-anthracite-950/60 px-2.5 py-2 font-mono text-[11px] text-muted-foreground"
            >
              {cmd}
            </code>
            <Button variant="secondary" size="sm" onClick={() => void copy()}>
              <Copy className="size-3.5" /> {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Agent script: <code>infra/windows-agent/</code> in the Chista repo.
          </p>
        </div>
      </div>
    </Card>
  );
}
