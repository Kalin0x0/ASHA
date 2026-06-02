'use client';

import { ArrowLeft, ExternalLink, Pause, XCircle } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Monogram } from '@/components/composite/monogram';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { SessionStatusPill } from '@/components/ui/status-pill';
import { useSession, useTerminateSession } from '@/lib/hooks';
import { formatDuration } from '@/lib/utils';

export default function SessionDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const session = useSession(params.id);
  const terminate = useTerminateSession();

  if (!session) {
    return (
      <div className="flex flex-col items-center gap-4 py-24 text-center">
        <p className="font-display text-xl">Session not found</p>
        <p className="text-sm text-muted-foreground">It may have been terminated.</p>
        <Button variant="secondary" onClick={() => router.push('/sessions')}>
          <ArrowLeft className="size-4" /> Back to sessions
        </Button>
      </div>
    );
  }

  const memPct = (session.memMb / session.memLimitMb) * 100;

  return (
    <div className="space-y-6">
      <button
        onClick={() => router.push('/sessions')}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Sessions
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
          <Button variant="secondary" size="sm" onClick={() => router.push(`/session/${session.id}`)}>
            <ExternalLink className="size-4" /> Open viewer
          </Button>
          <Button variant="secondary" size="sm" onClick={() => toast('Pause requested')}>
            <Pause className="size-4" /> Pause
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              terminate(session.id);
              toast.success('Session terminated');
              router.push('/sessions');
            }}
          >
            <XCircle className="size-4" /> Terminate
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* Live preview */}
        <Card elevation={1} className="overflow-hidden xl:col-span-2">
          <div className="relative aspect-video w-full bg-anthracite-950">
            <div className="absolute inset-0 bg-grid opacity-40" />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <Monogram name={session.workspaceName} className="size-16 rounded-2xl" />
              <p className="font-display text-lg text-anthracite-100">{session.workspaceName}</p>
              <p className="text-xs text-muted-foreground">Live preview · streaming over {session.connectionType}</p>
            </div>
            {/* HUD */}
            <div className="absolute left-3 top-3 flex items-center gap-2 rounded-md glass px-2.5 py-1 text-xs">
              <span className="size-1.5 rounded-full bg-success animate-pulse-ring" />
              {session.connectionType} · 1920×1080
            </div>
            <div className="absolute right-3 top-3 rounded-md glass px-2.5 py-1 font-mono text-xs text-muted-foreground">
              {Math.round(session.cpuPct)}% CPU · {(session.memMb / 1024).toFixed(1)} GB
            </div>
          </div>
        </Card>

        {/* Details */}
        <div className="space-y-4">
          <Card elevation={1}>
            <CardHeader>
              <CardTitle>Resources</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Metric label="CPU" value={`${Math.round(session.cpuPct)}%`}>
                <Progress value={session.cpuPct} tone={session.cpuPct > 85 ? 'destructive' : 'gold'} />
              </Metric>
              <Metric
                label="Memory"
                value={`${(session.memMb / 1024).toFixed(1)} / ${(session.memLimitMb / 1024).toFixed(0)} GB`}
              >
                <Progress value={memPct} tone={memPct > 85 ? 'destructive' : 'info'} />
              </Metric>
            </CardContent>
          </Card>

          <Card elevation={1}>
            <CardHeader>
              <CardTitle>Placement</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 text-sm">
              <Row label="User" value={session.user.name} />
              <Row label="Zone" value={session.zone} />
              <Row label="Agent" value={session.agent} />
              <Row label="Connection" value={session.connectionType} />
              <Row label="Uptime" value={formatDuration(session.uptimeSec)} />
              <Row label="Recording" value={<Badge variant="outline">Disabled</Badge>} />
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
