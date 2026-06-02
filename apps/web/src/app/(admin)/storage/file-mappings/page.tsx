'use client';

import { FileCog, Package, Shield } from 'lucide-react';
import { PageHeader } from '@/components/composite/page-header';
import { StatCard } from '@/components/composite/stat-card';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

export default function FileMappingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="File Mappings"
        description="Individual files injected into container sessions at launch — config files, SSH keys, certificates, or corporate trust stores. Supports POSIX ownership and mode bits."
        actions={<Badge variant="info">Phase 2</Badge>}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="File mappings" value={0} icon={FileCog} primary />
        <StatCard label="Workspaces using" value={0} icon={Package} />
        <StatCard label="Secured files" value={0} icon={Shield} />
      </div>

      <Card elevation={1} className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-aurora opacity-[0.12]" />
        <div className="relative flex flex-col items-center gap-5 px-6 py-20 text-center">
          <span className="flex size-16 items-center justify-center rounded-2xl border border-[rgba(212,175,55,0.3)] bg-gold-500/10 text-gold-300">
            <FileCog className="size-7" />
          </span>
          <div className="space-y-2">
            <h2 className="font-display text-2xl font-medium">No file mappings</h2>
            <p className="mx-auto max-w-md text-sm text-muted-foreground">
              File mappings write individual files into a container&apos;s filesystem at the moment it starts.
              Common uses: corporate CA certificates, SSH authorized_keys, application config, and Git credentials
              — without baking them into the image.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5 rounded-full border border-border-subtle px-3 py-1.5">
              <span className="size-1.5 rounded-full bg-gold-400" /> POSIX owner, group &amp; mode
            </span>
            <span className="flex items-center gap-1.5 rounded-full border border-border-subtle px-3 py-1.5">
              <span className="size-1.5 rounded-full bg-gold-400" /> Per-user or workspace scope
            </span>
            <span className="flex items-center gap-1.5 rounded-full border border-border-subtle px-3 py-1.5">
              <span className="size-1.5 rounded-full bg-gold-400" /> Home profile injection
            </span>
            <span className="flex items-center gap-1.5 rounded-full border border-border-subtle px-3 py-1.5">
              <Shield className="size-3" /> Secret store integration
            </span>
          </div>
        </div>
      </Card>
    </div>
  );
}
