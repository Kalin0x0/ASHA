'use client';

import { Clock, Film, HardDrive } from 'lucide-react';
import { Monogram } from '@/components/composite/monogram';
import { PageHeader } from '@/components/composite/page-header';
import { StatCard } from '@/components/composite/stat-card';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useRecordings } from '@/lib/hooks';
import type { RecordingRow } from '@/lib/types';
import { formatDuration } from '@/lib/utils';

const STATUS_VARIANT: Record<RecordingRow['status'], 'success' | 'info' | 'outline' | 'destructive'> = {
  AVAILABLE: 'success',
  RECORDING: 'info',
  FINALIZING: 'outline',
  FAILED: 'destructive',
};

export default function RecordingsPage() {
  const recordings = useRecordings();
  const totalMb = recordings.reduce((s, r) => s + r.sizeMb, 0);
  const avgDuration =
    recordings.length > 0
      ? Math.floor(recordings.reduce((s, r) => s + r.durationSec, 0) / recordings.length)
      : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Session Recordings"
        description="Record, store and replay session streams. Recordings are saved to S3-compatible object storage and can be downloaded or reviewed in-browser."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Recordings" value={recordings.length} icon={Film} primary />
        <StatCard label="Total stored (GB)" value={Math.round(totalMb / 1024)} icon={HardDrive} />
        <StatCard label="Avg duration (min)" value={Math.round(avgDuration / 60)} icon={Clock} />
      </div>

      {recordings.length > 0 ? (
        <Card elevation={1} className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-5 py-3 font-medium">Workspace</th>
                  <th className="px-5 py-3 font-medium">User</th>
                  <th className="px-5 py-3 font-medium">Protocol</th>
                  <th className="px-5 py-3 font-medium">Duration</th>
                  <th className="px-5 py-3 font-medium">Size</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {recordings.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-border-subtle/60 transition-colors last:border-0 hover:bg-secondary/40"
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Monogram name={r.workspaceName} className="size-9" />
                        <span className="font-medium">{r.workspaceName}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">{r.user}</td>
                    <td className="px-5 py-3">
                      <Badge variant="outline">{r.protocol}</Badge>
                    </td>
                    <td className="px-5 py-3 tnum text-muted-foreground">{formatDuration(r.durationSec)}</td>
                    <td className="px-5 py-3 tnum text-muted-foreground">
                      {r.sizeMb >= 1024 ? `${(r.sizeMb / 1024).toFixed(1)} GB` : `${r.sizeMb} MB`}
                    </td>
                    <td className="px-5 py-3">
                      <Badge variant={STATUS_VARIANT[r.status]} className="capitalize">
                        {r.status.toLowerCase()}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <Card elevation={1} className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0 bg-aurora opacity-[0.12]" />
          <div className="relative flex flex-col items-center gap-5 px-6 py-20 text-center">
            <span className="flex size-16 items-center justify-center rounded-2xl border border-[rgba(212,175,55,0.3)] bg-gold-500/10 text-gold-300">
              <Film className="size-7" />
            </span>
            <div className="space-y-2">
              <h2 className="font-display text-2xl font-medium">No recordings yet</h2>
              <p className="mx-auto max-w-md text-sm text-muted-foreground">
                Once recording is enabled for a workspace, session streams are captured and uploaded to your
                configured S3 bucket. Recordings appear here as soon as a session ends.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5 rounded-full border border-border-subtle px-3 py-1.5">
                <span className="size-1.5 rounded-full bg-gold-400" /> S3-compatible storage
              </span>
              <span className="flex items-center gap-1.5 rounded-full border border-border-subtle px-3 py-1.5">
                <span className="size-1.5 rounded-full bg-gold-400" /> In-browser playback
              </span>
              <span className="flex items-center gap-1.5 rounded-full border border-border-subtle px-3 py-1.5">
                <span className="size-1.5 rounded-full bg-gold-400" /> Per-workspace opt-in
              </span>
              <span className="flex items-center gap-1.5 rounded-full border border-border-subtle px-3 py-1.5">
                <span className="size-1.5 rounded-full bg-gold-400" /> Retention policy
              </span>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
