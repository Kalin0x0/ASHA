'use client';

import { Cpu, MemoryStick, Play, Sparkles } from 'lucide-react';
import { Monogram } from '@/components/composite/monogram';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { Workspace } from '@/lib/types';
import { cn } from '@/lib/utils';

export function WorkspaceCard({
  workspace,
  onLaunch,
  launching = false,
}: {
  workspace: Workspace;
  onLaunch?: (id: string) => void;
  launching?: boolean;
}) {
  return (
    <Card interactive className="group flex flex-col gap-4 p-5">
      <div className="flex items-start gap-3">
        <Monogram name={workspace.friendlyName} className="size-11" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-display text-base font-medium">{workspace.friendlyName}</h3>
            {workspace.gpu > 0 && (
              <Badge variant="gold" className="gap-1">
                <Sparkles className="size-3" /> GPU
              </Badge>
            )}
          </div>
          <span className="text-xs text-muted-foreground">{workspace.category}</span>
        </div>
      </div>

      <p className="line-clamp-2 min-h-[2.5rem] text-sm text-muted-foreground">{workspace.description}</p>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Cpu className="size-3.5" /> {workspace.cores} vCPU
        </span>
        <span className="inline-flex items-center gap-1">
          <MemoryStick className="size-3.5" /> {(workspace.memMb / 1024).toFixed(1)} GB
        </span>
        {workspace.activeSessions > 0 && (
          <span className="ml-auto inline-flex items-center gap-1.5 text-success">
            <span className="size-1.5 rounded-full bg-success" />
            {workspace.activeSessions} active
          </span>
        )}
      </div>

      <div className="mt-auto flex items-center gap-2 pt-1">
        <Button
          size="sm"
          className="flex-1"
          disabled={!workspace.enabled}
          loading={launching}
          onClick={() => onLaunch?.(workspace.id)}
        >
          {!launching && <Play className="size-3.5" />}
          {workspace.enabled ? 'Launch' : 'Disabled'}
        </Button>
      </div>

      <span
        className={cn(
          'pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-500/0 to-transparent transition-all duration-300 group-hover:via-gold-500/60',
        )}
      />
    </Card>
  );
}
