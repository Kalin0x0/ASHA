'use client';

import { Clock, Film, HardDrive } from 'lucide-react';
import { PageHeader } from '@/components/composite/page-header';
import { StatCard } from '@/components/composite/stat-card';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

export default function RecordingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Session Recordings"
        description="Record, store and replay session streams. Recordings are saved to S3-compatible object storage and can be downloaded or reviewed in-browser."
        actions={
          <Badge variant="info">Phase 2</Badge>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Recordings" value={0} icon={Film} primary />
        <StatCard label="Total stored (GB)" value={0} icon={HardDrive} />
        <StatCard label="Avg duration (min)" value={0} icon={Clock} />
      </div>

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
    </div>
  );
}
