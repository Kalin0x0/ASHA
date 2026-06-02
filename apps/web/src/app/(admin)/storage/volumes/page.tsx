'use client';

import { Database, HardDrive, Package } from 'lucide-react';
import { PageHeader } from '@/components/composite/page-header';
import { StatCard } from '@/components/composite/stat-card';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

export default function VolumeMappingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Volume Mappings"
        description="Named Docker volumes or host-path mounts that are injected into workspace containers at launch time. Use these to share datasets, code repositories, or shared assets across sessions."
        actions={<Badge variant="info">Phase 2</Badge>}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Volume mappings" value={0} icon={Database} primary />
        <StatCard label="Workspaces using" value={0} icon={Package} />
        <StatCard label="Total size (GB)" value={0} icon={HardDrive} />
      </div>

      <Card elevation={1} className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-aurora opacity-[0.12]" />
        <div className="relative flex flex-col items-center gap-5 px-6 py-20 text-center">
          <span className="flex size-16 items-center justify-center rounded-2xl border border-[rgba(212,175,55,0.3)] bg-gold-500/10 text-gold-300">
            <Database className="size-7" />
          </span>
          <div className="space-y-2">
            <h2 className="font-display text-2xl font-medium">No volume mappings</h2>
            <p className="mx-auto max-w-md text-sm text-muted-foreground">
              Volume mappings inject pre-existing Docker volumes or NFS/host-path mounts into workspace
              containers. They are ideal for shared datasets, large models, or read-only code repositories
              that many users need access to without per-user copies.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5 rounded-full border border-border-subtle px-3 py-1.5">
              <span className="size-1.5 rounded-full bg-gold-400" /> Docker volumes or host paths
            </span>
            <span className="flex items-center gap-1.5 rounded-full border border-border-subtle px-3 py-1.5">
              <span className="size-1.5 rounded-full bg-gold-400" /> Read-only or read-write
            </span>
            <span className="flex items-center gap-1.5 rounded-full border border-border-subtle px-3 py-1.5">
              <span className="size-1.5 rounded-full bg-gold-400" /> Per-workspace assignment
            </span>
            <span className="flex items-center gap-1.5 rounded-full border border-border-subtle px-3 py-1.5">
              <span className="size-1.5 rounded-full bg-gold-400" /> Zone-aware routing
            </span>
          </div>
        </div>
      </Card>
    </div>
  );
}
