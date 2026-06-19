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
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/composite/empty-state';
import { PageHeader } from '@/components/composite/page-header';
import { StatCard } from '@/components/composite/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useConfirm } from '@/components/ui/confirm';
import { isLive } from '@/lib/api/mode';
import { type ApiSessionShare, useRevokeShare, useSessionShares } from '@/lib/hooks.storage';

function expiryLabel(iso: string | null): {
  key: 'noExpiry' | 'expired' | 'minutesLeft' | 'hoursLeft';
  count: number;
  expired: boolean;
} {
  if (!iso) return { key: 'noExpiry', count: 0, expired: false };
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return { key: 'expired', count: 0, expired: true };
  const mins = Math.round(diff / 6e4);
  if (mins < 60) return { key: 'minutesLeft', count: mins, expired: false };
  const hrs = Math.round(mins / 60);
  return { key: 'hoursLeft', count: hrs, expired: false };
}

export default function SharingPage() {
  const t = useTranslations('sessions');
  const tc = useTranslations('common');
  const confirm = useConfirm();
  const { data: shares = [], isLoading } = useSessionShares();
  const revoke = useRevokeShare();
  const [busyId, setBusyId] = useState<string | null>(null);

  const participants = shares.reduce((sum, s) => sum + (s.participantCount ?? 0), 0);

  const onRevoke = async (share: ApiSessionShare) => {
    if (
      !(await confirm({
        title: tc('confirm.deleteNamed', { name: share.workspaceName ?? share.sessionId }),
        confirmLabel: tc('actions.remove'),
      }))
    )
      return;
    setBusyId(share.id);
    try {
      await revoke.mutateAsync(share);
      toast.success(t('sharing.toastRevoked'), {
        description: t('sharing.toastRevokedDescription', { name: share.workspaceName ?? share.sessionId }),
      });
    } catch {
      toast.error(t('sharing.toastRevokeFailed'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('sharing.title')}
        description={t('sharing.description')}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label={t('sharing.stats.activeShares')} value={shares.length} icon={Share2} primary />
        <StatCard label={t('sharing.stats.connectedGuests')} value={participants} icon={Users} />
        <StatCard label={t('sharing.stats.interactive')} value={shares.filter((s) => s.allowControl).length} icon={MousePointerClick} />
      </div>

      {isLive && (
        <Card elevation={1} className="p-4 text-sm text-muted-foreground">
          {t('sharing.liveNotice')}
        </Card>
      )}

      <Card elevation={1} className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border-subtle p-4">
          <h2 className="font-display text-lg font-medium">{t('sharing.activeSharesTitle')}</h2>
          {isLoading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        </div>
        <div className="divide-y divide-border-subtle/60">
          {shares.length === 0 ? (
            <EmptyState icon={Share2} title={t('sharing.emptyTitle')} description={t('sharing.emptyDescription')} />
          ) : (
            shares.map((s) => {
              const exp = expiryLabel(s.expiresAt);
              return (
                <div key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm transition-all duration-150 hover:bg-gold-500/[0.05] hover:shadow-[inset_2px_0_0_rgba(212,175,55,0.55)]">
                  <Share2 className="size-4 text-gold-300" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {s.workspaceName ?? s.sessionId}
                      <span className="ml-2 font-normal text-muted-foreground">· {s.ownerName ?? t('sharing.unknownOwner')}</span>
                    </p>
                    <p className="truncate font-mono text-xs text-muted-foreground">{s.shareKey}</p>
                  </div>

                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Users className="size-3.5" /> {s.participantCount ?? 0}
                  </span>

                  {s.allowControl ? (
                    <Badge variant="gold">
                      <MousePointerClick className="size-3" /> {t('sharing.badges.control')}
                    </Badge>
                  ) : (
                    <Badge variant="outline">{t('sharing.badges.viewOnly')}</Badge>
                  )}
                  {s.enableChat && (
                    <Badge variant="outline">
                      <MessageSquare className="size-3" /> {t('sharing.badges.chat')}
                    </Badge>
                  )}
                  {s.enableAv && (
                    <Badge variant="outline">
                      <Mic className="size-3" /> {t('sharing.badges.av')}
                    </Badge>
                  )}
                  {s.requireAuth && (
                    <Badge variant="outline">
                      <Lock className="size-3" /> {t('sharing.badges.auth')}
                    </Badge>
                  )}
                  <Badge variant={exp.expired ? 'destructive' : 'success'}>
                    {t(`sharing.expiry.${exp.key}`, { count: exp.count })}
                  </Badge>

                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busyId === s.id}
                    onClick={() => void onRevoke(s)}
                  >
                    {busyId === s.id ? <Loader2 className="size-3.5 animate-spin" /> : <XCircle className="size-3.5" />}
                    {t('sharing.revoke')}
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
