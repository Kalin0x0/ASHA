'use client';

import { ArrowLeft, ExternalLink, Eye, Pause, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Monogram } from '@/components/composite/monogram';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useConfirm } from '@/components/ui/confirm';
import { Progress } from '@/components/ui/progress';
import { SessionStatusPill } from '@/components/ui/status-pill';
import { useAuth } from '@/lib/api/auth-context';
import { isLive } from '@/lib/api/mode';
import { useSession, useStartObservation, useTerminateSession, useWorkspaces } from '@/lib/hooks';
import { canAccessRoute } from '@/lib/nav';
import { OBSERVE_THUMB_WIDTH, isObservableSession, watchRoute } from '@/lib/observation';
import { createWindowId } from '@/lib/observation-windows';
import { useThumbnails } from '@/lib/thumbnail-store';
import { formatDuration } from '@/lib/utils';

/**
 * A terminal has no second seat — guacd cannot join a running SSH connection —
 * so it is the one kind the button is hidden for outright. Every other kind is
 * offered and the API decides, because only it knows whether an agent is
 * reporting for the session: the protocol label does not say, and a container
 * reached over guacd carries the same RDP label as a fixed server.
 */
const NO_SHARED_VIEW = new Set(['SSH']);

export default function SessionDetailPage() {
  const t = useTranslations('sessions');
  const tc = useTranslations('common');
  const confirm = useConfirm();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const session = useSession(params.id);
  const terminate = useTerminateSession();
  const startObservation = useStartObservation();
  const workspaces = useWorkspaces();
  // The thumbnail cache is keyed by workspace id; resolve it from the name.
  const workspaceId = workspaces.find((w) => w.friendlyName === session?.workspaceName)?.id;
  const thumb = useThumbnails((s) => (workspaceId ? s.thumbs[workspaceId] : undefined));
  // Watching is its own permission. Offering the control to someone who does
  // not hold it buys them a 403 and no explanation.
  const mayObserve =
    !isLive || !user || canAccessRoute('/sessions/monitor', user.permissions, user.isSystemAdmin);
  const canWatch = session
    ? mayObserve && isObservableSession(session) && !NO_SHARED_VIEW.has(session.connectionType)
    : false;

  /**
   * The same path the live wall takes. The proxy grants a view-only stream on a
   * watch token and nothing else, so the old `/connect/<kasmId>?monitor=1` —
   * which streamed on the admin's own access token — is answered with 4003
   * every time. Minting the token here is also what writes the audit entry and
   * puts the notice on the watched person's screen.
   */
  const watchLive = async () => {
    if (!session) return;
    try {
      const viewerWindow = createWindowId('view');
      const win = await startObservation(
        session.id,
        // Metadata only: this opens the live picture, and asking the agent for
        // thumbnails on top would read the same desktop twice.
        { intervalMs: 0, thumbWidth: OBSERVE_THUMB_WIDTH },
        viewerWindow,
      );
      const route = watchRoute(win, session.id, viewerWindow);
      if (!route) {
        toast.error(t(`monitor.watchUnavailable.${win.watchReason ?? 'unknown'}`));
        return;
      }
      router.push(route);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('monitor.watchFailed'));
    }
  };

  if (!session) {
    return (
      <div className="flex flex-col items-center gap-4 py-24 text-center">
        <p className="font-display text-xl">{t('detail.notFoundTitle')}</p>
        <p className="text-sm text-muted-foreground">{t('detail.notFoundDescription')}</p>
        <Button variant="secondary" onClick={() => router.push('/sessions')}>
          <ArrowLeft className="size-4 rtl:rotate-180" /> {t('detail.backToSessions')}
        </Button>
      </div>
    );
  }

  const memPct = (session.memMb / session.memLimitMb) * 100;

  const onTerminate = async () => {
    if (
      !(await confirm({
        title: tc('confirm.title'),
        confirmLabel: tc('actions.terminate'),
        description: tc('confirm.description'),
      }))
    )
      return;
    try {
      await terminate(session.id);
    } catch (err) {
      // Never navigate away from a session that is still running.
      toast.error(err instanceof Error ? err.message : t('detail.toastTerminateFailed'));
      return;
    }
    toast.success(t('detail.toastTerminated'));
    router.push('/sessions');
  };

  return (
    <div className="space-y-6">
      <button
        onClick={() => router.push('/sessions')}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4 rtl:rotate-180" /> {t('detail.breadcrumb')}
      </button>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Monogram name={session.workspaceName} className="size-12" />
          <div>
            <h1 className="font-display text-2xl font-medium">{session.workspaceName}</h1>
            <div className="mt-0.5 flex items-center gap-3">
              <SessionStatusPill status={session.status} />
              <span className="font-mono text-xs text-muted-foreground">{session.kasmId}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canWatch && (
            <Button variant="secondary" size="sm" onClick={() => void watchLive()} title={t('detail.watchHint')}>
              <Eye className="size-4" /> {t('detail.watchLive')}
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => router.push(`/session/${session.id}`)}>
            <ExternalLink className="size-4" /> {t('detail.openViewer')}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => toast(t('detail.toastPauseRequested'))}>
            <Pause className="size-4" /> {t('detail.pause')}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => void onTerminate()}
          >
            <XCircle className="size-4" /> {tc('actions.terminate')}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* Live preview — last captured screen; click to watch live (view-only) */}
        <Card elevation={1} className="group relative overflow-hidden xl:col-span-2">
          <button
            type="button"
            onClick={canWatch ? () => void watchLive() : () => router.push(`/session/${session.id}`)}
            className="block w-full text-start ring-gold-focus"
            aria-label={canWatch ? t('detail.watchLive') : t('detail.openViewer')}
          >
            <div className="relative aspect-video w-full bg-anthracite-950">
              {thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumb.dataUrl} alt={session.workspaceName} className="absolute inset-0 size-full object-cover" />
              ) : (
                <>
                  <div className="absolute inset-0 bg-grid opacity-40" />
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                    <Monogram name={session.workspaceName} className="size-16 rounded-2xl" />
                    <p className="font-display text-lg text-anthracite-100">{session.workspaceName}</p>
                    <p className="text-xs text-muted-foreground">{t('detail.livePreview', { connection: session.connectionType })}</p>
                  </div>
                </>
              )}

              {/* Hover affordance */}
              <div className="absolute inset-0 flex items-center justify-center bg-anthracite-950/40 opacity-0 transition-opacity group-hover:opacity-100">
                <span className="inline-flex items-center gap-2 rounded-lg glass-strong px-3.5 py-2 text-sm font-medium">
                  <Eye className="size-4 text-gold-300" /> {canWatch ? t('detail.watchLive') : t('detail.openViewer')}
                </span>
              </div>

              {/* HUD */}
              <div className="absolute start-3 top-3 flex items-center gap-2 rounded-md glass px-2.5 py-1 text-xs">
                <span className="size-1.5 rounded-full bg-success animate-pulse-ring" />
                {session.connectionType} · 1920×1080
              </div>
              {canWatch && (
                <div className="absolute end-3 bottom-3 inline-flex items-center gap-1.5 rounded-md border border-info/40 bg-info/10 px-2 py-1 text-[11px] font-medium text-info">
                  <Eye className="size-3" /> {t('detail.viewOnly')}
                </div>
              )}
              <div className="absolute end-3 top-3 rounded-md glass px-2.5 py-1 font-mono text-xs text-muted-foreground">
                {Math.round(session.cpuPct)}% CPU · {(session.memMb / 1024).toFixed(1)} GB
              </div>
            </div>
          </button>
        </Card>

        {/* Details */}
        <div className="space-y-4">
          <Card elevation={1}>
            <CardHeader>
              <CardTitle>{t('detail.resources')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Metric label="CPU" value={`${Math.round(session.cpuPct)}%`}>
                <Progress value={session.cpuPct} tone={session.cpuPct > 85 ? 'destructive' : 'gold'} />
              </Metric>
              <Metric
                label={t('detail.memory')}
                value={`${(session.memMb / 1024).toFixed(1)} / ${(session.memLimitMb / 1024).toFixed(0)} GB`}
              >
                <Progress value={memPct} tone={memPct > 85 ? 'destructive' : 'info'} />
              </Metric>
            </CardContent>
          </Card>

          <Card elevation={1}>
            <CardHeader>
              <CardTitle>{t('detail.placement')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 text-sm">
              <Row label={t('detail.user')} value={session.user.name} />
              <Row label={t('detail.zone')} value={session.zone} />
              <Row label={t('detail.agent')} value={session.agent} />
              <Row label={t('detail.connection')} value={session.connectionType} />
              <Row label={t('detail.uptime')} value={formatDuration(session.uptimeSec)} />
              <Row label={t('detail.recording')} value={<Badge variant="outline">{tc('labels.disabled')}</Badge>} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, children }: { label: string; value: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="tnum">{value}</span>
      </div>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
