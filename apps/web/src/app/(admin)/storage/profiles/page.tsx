'use client';

import { FolderCog, HardDrive, Users } from 'lucide-react';
import { PageHeader } from '@/components/composite/page-header';
import { StatCard } from '@/components/composite/stat-card';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

export default function PersistentProfilesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Persistent Profiles"
        description="User home directories and application data that survive across sessions. Each profile is backed by a Docker volume or S3-compatible object store."
        actions={<Badge variant="info">Phase 2</Badge>}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Profiles" value={0} icon={FolderCog} primary />
        <StatCard label="Users with profiles" value={0} icon={Users} />
        <StatCard label="Storage used (GB)" value={0} icon={HardDrive} />
      </div>

      <Card elevation={1} className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-aurora opacity-[0.12]" />
        <div className="relative flex flex-col items-center gap-5 px-6 py-20 text-center">
          <span className="flex size-16 items-center justify-center rounded-2xl border border-[rgba(212,175,55,0.3)] bg-gold-500/10 text-gold-300">
            <FolderCog className="size-7" />
          </span>
          <div className="space-y-2">
            <h2 className="font-display text-2xl font-medium">No persistent profiles</h2>
            <p className="mx-auto max-w-md text-sm text-muted-foreground">
              Persistent profiles let users carry their home directory, browser history, SSH keys, and
              application settings across sessions. Profiles are created automatically the first time
              a user launches a workspace with persistence enabled.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5 rounded-full border border-border-subtle px-3 py-1.5">
              <span className="size-1.5 rounded-full bg-gold-400" /> Docker volumes or S3
            </span>
            <span className="flex items-center gap-1.5 rounded-full border border-border-subtle px-3 py-1.5">
              <span className="size-1.5 rounded-full bg-gold-400" /> Per-user or per-group
            </span>
            <span className="flex items-center gap-1.5 rounded-full border border-border-subtle px-3 py-1.5">
              <span className="size-1.5 rounded-full bg-gold-400" /> Quota limits
            </span>
            <span className="flex items-center gap-1.5 rounded-full border border-border-subtle px-3 py-1.5">
              <span className="size-1.5 rounded-full bg-gold-400" /> Snapshot & restore
            </span>
          </div>
        </div>
      </Card>
    </div>
  );
}
