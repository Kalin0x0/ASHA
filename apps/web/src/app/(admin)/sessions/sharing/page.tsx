'use client';

import { Link2, MessageSquare, Share2, Users } from 'lucide-react';
import { PageHeader } from '@/components/composite/page-header';
import { StatCard } from '@/components/composite/stat-card';
import { Card } from '@/components/ui/card';

export default function SharingPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Session Sharing"
        description="Share live workspace sessions with collaborators using time-limited invite links. Guests can view or interact depending on the permission level you grant."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Active shares" value={0} icon={Share2} primary />
        <StatCard label="Collaborators" value={0} icon={Users} />
        <StatCard label="Invite links" value={0} icon={Link2} />
      </div>

      <Card elevation={1} className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-aurora opacity-[0.12]" />
        <div className="relative flex flex-col items-center gap-5 px-6 py-20 text-center">
          <span className="flex size-16 items-center justify-center rounded-2xl border border-[rgba(212,175,55,0.3)] bg-gold-500/10 text-gold-300">
            <Share2 className="size-7" />
          </span>
          <div className="space-y-2">
            <h2 className="font-display text-2xl font-medium">No active shares</h2>
            <p className="mx-auto max-w-md text-sm text-muted-foreground">
              Sharing lets you open a running session to guests via a time-limited invite link.
              Guests join the same container in read-only or interactive mode, with an in-session chat
              channel powered by the existing WebSocket events bus.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5 rounded-full border border-border-subtle px-3 py-1.5">
              <span className="size-1.5 rounded-full bg-gold-400" /> View-only or interactive
            </span>
            <span className="flex items-center gap-1.5 rounded-full border border-border-subtle px-3 py-1.5">
              <span className="size-1.5 rounded-full bg-gold-400" /> Time-limited invite links
            </span>
            <span className="flex items-center gap-1.5 rounded-full border border-border-subtle px-3 py-1.5">
              <MessageSquare className="size-3" /> In-session chat
            </span>
            <span className="flex items-center gap-1.5 rounded-full border border-border-subtle px-3 py-1.5">
              <span className="size-1.5 rounded-full bg-gold-400" /> Revoke at any time
            </span>
          </div>
        </div>
      </Card>
    </div>
  );
}
