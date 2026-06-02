'use client';

import { Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { AuroraBackground } from '@/components/decor/aurora-background';
import { WorkspaceCard } from '@/components/composite/workspace-card';
import { Input } from '@/components/ui/input';
import { useLaunchSession, useWorkspaces } from '@/lib/hooks';

export default function PortalHome() {
  const router = useRouter();
  const workspaces = useWorkspaces();
  const launch = useLaunchSession();
  const [query, setQuery] = useState('');
  const [launchingId, setLaunchingId] = useState<string | null>(null);

  const enabled = useMemo(
    () =>
      workspaces.filter(
        (w) =>
          w.enabled &&
          (!query ||
            w.friendlyName.toLowerCase().includes(query.toLowerCase()) ||
            w.category.toLowerCase().includes(query.toLowerCase())),
      ),
    [workspaces, query],
  );

  const onLaunch = (id: string) => {
    setLaunchingId(id);
    const session = launch(id);
    setTimeout(() => {
      router.push(`/session/${session?.id ?? 'new'}`);
    }, 500);
  };

  return (
    <div>
      {/* Hero */}
      <div className="relative overflow-hidden border-b border-border-subtle">
        <AuroraBackground className="opacity-60" />
        <div className="relative mx-auto max-w-[1400px] px-4 py-14 lg:px-8">
          <p className="text-sm font-medium uppercase tracking-widest text-gold-300/80">Workspaces</p>
          <h1 className="mt-2 font-display text-4xl font-medium tracking-tight sm:text-5xl">
            Launch a workspace
          </h1>
          <p className="mt-3 max-w-xl text-muted-foreground">
            Stream a secure, isolated desktop, browser, or application straight to this browser — no install,
            nothing left behind.
          </p>
          <div className="relative mt-6 max-w-md">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search your workspaces…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-11 pl-9"
            />
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="mx-auto max-w-[1400px] px-4 py-10 lg:px-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {enabled.map((ws) => (
            <WorkspaceCard
              key={ws.id}
              workspace={ws}
              onLaunch={onLaunch}
              launching={launchingId === ws.id}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
