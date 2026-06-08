'use client';

import {
  Loader2,
  Lock,
  MessageSquare,
  Mic,
  MousePointerClick,
  Share2,
  Users,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/composite/page-header';
import { StatCard } from '@/components/composite/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { isLive } from '@/lib/api/mode';
import { type ApiSessionShare, useRevokeShare, useSessionShares } from '@/lib/hooks.storage';

function expiryLabel(iso: string | null): { text: string; expired: boolean } {
  if (!iso) return { text: 'No expiry', expired: false };
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return { text: 'Expired', expired: true };
  const mins = Math.round(diff / 6e4);
  if (mins < 60) return { text: `${mins}m left`, expired: false };
  const hrs = Math.round(mins / 60);
  return { text: `${hrs}h left`, expired: false };
}

export default function SharingPage() {
  const { data: shares = [], isLoading } = useSessionShares();
  const revoke = useRevokeShare();
  const [busyId, setBusyId] = useState<string | null>(null);

  const participants = shares.reduce((sum, s) => sum + (s.participantCount ?? 0), 0);

  const onRevoke = async (share: ApiSessionShare) => {
    setBusyId(share.id);
    try {
      await revoke.mutateAsync(share);
      toast.success('Share revoked', { description: `Guests of ${share.workspaceName ?? share.sessionId} disconnected.` });
    } catch {
      toast.error('Could not revoke share');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Session Sharing"
        description="Live, time-limited shares opened from inside running sessions. Guests join the same container in view-only or interactive mode. Revoke a share at any time to disconnect every guest."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Active shares" value={shares.length} icon={Share2} primary />
        <StatCard label="Connected guests" value={participants} icon={Users} />
        <StatCard label="Interactive" value={shares.filter((s) => s.allowControl).length} icon={MousePointerClick} />
      </div>

      {isLive && (
        <Card elevation={1} className="p-4 text-sm text-muted-foreground">
          Shares are created from inside a running session. An org-wide live listing endpoint is not exposed
          yet, so this admin view is empty in live mode — manage a share from its session detail page.
        </Card>
      )}

      <Card elevation={1} className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border-subtle p-4">
          <h2 className="font-display text-lg font-medium">Active shares</h2>
          {isLoading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        </div>
        <div className="divide-y divide-border-subtle/60">
          {shares.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">No active session shares.</p>
          ) : (
            shares.map((s) => {
              const exp = expiryLabel(s.expiresAt);
              return (
                <div key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                  <Share2 className="size-4 text-gold-300" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {s.workspaceName ?? s.sessionId}
                      <span className="ml-2 font-normal text-muted-foreground">· {s.ownerName ?? 'unknown owner'}</span>
                    </p>
                    <p className="truncate font-mono text-xs text-muted-foreground">{s.shareKey}</p>
                  </div>

                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Users className="size-3.5" /> {s.participantCount ?? 0}
                  </span>

                  {s.allowControl ? (
                    <Badge variant="gold">
                      <MousePointerClick className="size-3" /> control
                    </Badge>
                  ) : (
                    <Badge variant="outline">view-only</Badge>
                  )}
                  {s.enableChat && (
                    <Badge variant="outline">
                      <MessageSquare className="size-3" /> chat
                    </Badge>
                  )}
                  {s.enableAv && (
                    <Badge variant="outline">
                      <Mic className="size-3" /> A/V
                    </Badge>
                  )}
                  {s.requireAuth && (
                    <Badge variant="outline">
                      <Lock className="size-3" /> auth
                    </Badge>
                  )}
                  <Badge variant={exp.expired ? 'destructive' : 'success'}>{exp.text}</Badge>

                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busyId === s.id}
                    onClick={() => void onRevoke(s)}
                  >
                    {busyId === s.id ? <Loader2 className="size-3.5 animate-spin" /> : <XCircle className="size-3.5" />}
                    Revoke
                  </Button>
                </div>
              );
            })
          )}
        </div>
      </Card>
    </div>
  );
}
