'use client';

import { Cpu, MemoryStick, Play, Sparkles, Star } from 'lucide-react';
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
  favorite = false,
  onToggleFavorite,
}: {
  workspace: Workspace;
  onLaunch?: (id: string) => void;
  launching?: boolean;
  favorite?: boolean;
  onToggleFavorite?: (id: string) => void;
}) {
  return (
    <Card
      interactive
      className="group relative flex flex-col overflow-hidden p-0 transition-all duration-300 hover:shadow-[0_8px_40px_-8px_rgba(212,175,55,0.2)]"
    >
      {/* Favorite toggle */}
      {onToggleFavorite && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(workspace.id);
          }}
          aria-label={favorite ? 'Remove from favorites' : 'Add to favorites'}
          aria-pressed={favorite}
          className={cn(
            'absolute right-3 top-3 z-10 flex size-8 items-center justify-center rounded-lg transition-all duration-200 ring-gold-focus',
            favorite
              ? 'text-gold-300 hover:text-gold-200'
              : 'text-muted-foreground/40 opacity-0 hover:text-gold-300 group-hover:opacity-100 focus-visible:opacity-100',
          )}
        >
          <Star className={cn('size-4 transition-all', favorite && 'fill-gold-400 drop-shadow-[0_0_6px_rgba(212,175,55,0.5)]')} />
        </button>
      )}

      {/* Color band header */}
      <div className="relative flex items-center gap-3.5 px-5 pt-5 pb-4">
        <div className="absolute inset-0 bg-gradient-to-b from-[var(--surface-2)] to-transparent opacity-60" />
        <div className="relative">
          <Monogram name={workspace.friendlyName} className="size-12 rounded-xl" />
        </div>
        <div className="relative min-w-0 flex-1 pr-7">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-display text-[15px] font-semibold leading-tight">
              {workspace.friendlyName}
            </h3>
            {workspace.gpu > 0 && (
              <Badge variant="gold" className="gap-1 shrink-0">
                <Sparkles className="size-3" /> GPU
              </Badge>
            )}
          </div>
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
            {workspace.category}
          </span>
        </div>
      </div>

      {/* Divider */}
      <div className="mx-5 h-px bg-border-subtle" />

      {/* Description */}
      <div className="flex flex-1 flex-col gap-4 px-5 py-4">
        <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
          {workspace.description}
        </p>

        {/* Specs row */}
        <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Cpu className="size-3.5 text-muted-foreground/60" />
            {workspace.cores} vCPU
          </span>
          <span className="inline-flex items-center gap-1.5">
            <MemoryStick className="size-3.5 text-muted-foreground/60" />
            {(workspace.memMb / 1024).toFixed(1)} GB
          </span>
          {workspace.activeSessions > 0 && (
            <span className="ml-auto inline-flex items-center gap-1.5 text-success font-medium">
              <span className="size-1.5 rounded-full bg-success animate-pulse-ring" />
              {workspace.activeSessions} active
            </span>
          )}
        </div>

        {/* Launch button */}
        <div className="mt-auto pt-1">
          <Button
            size="sm"
            className={cn(
              'w-full transition-all duration-200',
              workspace.enabled && 'group-hover:shadow-[0_0_20px_-4px_rgba(212,175,55,0.4)]',
            )}
            disabled={!workspace.enabled}
            loading={launching}
            onClick={() => onLaunch?.(workspace.id)}
          >
            {!launching && <Play className="size-3.5" />}
            {workspace.enabled ? 'Launch' : 'Disabled'}
          </Button>
        </div>
      </div>

      {/* Top gold shimmer on hover */}
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-500/0 to-transparent transition-all duration-500 group-hover:via-gold-500/70" />
    </Card>
  );
}
