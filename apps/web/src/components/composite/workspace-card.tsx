'use client';

import { Cpu, Lock, MemoryStick, Play, Sparkles, Star } from 'lucide-react';
import { Monogram } from '@/components/composite/monogram';
import { Badge } from '@/components/ui/badge';
import { categoryVisual } from '@/lib/workspace-visuals';
import type { Workspace } from '@/lib/types';
import { cn } from '@/lib/utils';

/**
 * Image-forward workspace tile — the launcher's centrepiece. Mirrors Kasm's
 * launch grid (a colour-coded app tile up top, metadata below, launch-on-hover)
 * while staying in the Chista anthracite + gold system. Click anywhere on an
 * enabled card to launch; the star and any drag handle stop propagation.
 */
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
  const { Icon, accent } = categoryVisual(workspace.category);
  const enabled = workspace.enabled;
  const protocolLabel = workspace.protocol === 'KASMVNC' ? 'KasmVNC' : workspace.protocol;

  const launch = () => {
    if (enabled && !launching) onLaunch?.(workspace.id);
  };

  return (
    <div
      role="button"
      tabIndex={enabled ? 0 : -1}
      aria-disabled={!enabled}
      aria-label={enabled ? `Launch ${workspace.friendlyName}` : `${workspace.friendlyName} (unavailable)`}
      onClick={launch}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && enabled) {
          e.preventDefault();
          launch();
        }
      }}
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-xl border border-border-subtle bg-[var(--surface-1)] text-left transition-all duration-300 ring-gold-focus',
        enabled
          ? 'cursor-pointer hover:-translate-y-1 hover:border-[rgba(212,175,55,0.4)] hover:shadow-[0_18px_48px_-18px_rgba(0,0,0,0.7),0_0_0_1px_rgba(212,175,55,0.12)]'
          : 'cursor-not-allowed opacity-60',
      )}
    >
      {/* ── App-tile hero ──────────────────────────────────────────── */}
      <div
        className="relative flex h-32 items-center justify-center overflow-hidden"
        style={{
          background: `radial-gradient(120% 120% at 50% 0%, color-mix(in srgb, ${accent} 26%, transparent), transparent 70%), linear-gradient(160deg, color-mix(in srgb, ${accent} 14%, var(--surface-2)), var(--surface-1))`,
        }}
      >
        {/* Oversized category glyph watermark */}
        <Icon
          className="pointer-events-none absolute -right-4 -top-3 size-28 opacity-[0.07] transition-transform duration-500 group-hover:scale-110"
          style={{ color: accent }}
          aria-hidden
        />

        {/* App glyph tile */}
        <Monogram
          name={workspace.friendlyName}
          className="size-16 rounded-2xl text-lg shadow-[0_8px_24px_-8px_rgba(0,0,0,0.6)] transition-transform duration-300 group-hover:scale-105"
        />

        {/* GPU badge */}
        {workspace.gpu > 0 && (
          <Badge variant="gold" className="absolute left-3 top-3 gap-1">
            <Sparkles className="size-3" /> GPU
          </Badge>
        )}

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
              'absolute right-2.5 top-2.5 z-10 flex size-8 items-center justify-center rounded-lg backdrop-blur transition-all duration-200 ring-gold-focus',
              favorite
                ? 'bg-anthracite-950/30 text-gold-300 hover:text-gold-200'
                : 'text-muted-foreground/60 opacity-0 hover:bg-anthracite-950/30 hover:text-gold-300 focus-visible:opacity-100 group-hover:opacity-100',
            )}
          >
            <Star
              className={cn(
                'size-4 transition-all',
                favorite && 'fill-gold-400 drop-shadow-[0_0_6px_rgba(212,175,55,0.5)]',
              )}
            />
          </button>
        )}

        {/* Launch-on-hover overlay (Kasm signature) */}
        {enabled ? (
          <div className="absolute inset-0 flex items-center justify-center bg-anthracite-950/55 opacity-0 backdrop-blur-[2px] transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
            <span className="inline-flex items-center gap-2 rounded-full bg-gold-500 px-5 py-2 text-sm font-semibold text-anthracite-950 shadow-[0_8px_24px_-6px_rgba(212,175,55,0.6)] transition-transform duration-200 group-hover:scale-105">
              {launching ? (
                <>
                  <span className="size-4 animate-spin rounded-full border-2 border-anthracite-950/30 border-t-anthracite-950" />
                  Starting…
                </>
              ) : (
                <>
                  <Play className="size-4 fill-anthracite-950" /> Launch
                </>
              )}
            </span>
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-anthracite-950/45">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-anthracite-900/80 px-3 py-1 text-xs font-medium text-muted-foreground">
              <Lock className="size-3" /> Unavailable
            </span>
          </div>
        )}
      </div>

      {/* ── Metadata ───────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="min-w-0 truncate font-display text-[15px] font-semibold leading-tight">
            {workspace.friendlyName}
          </h3>
          <span className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
            {protocolLabel}
          </span>
        </div>

        <p className="line-clamp-2 flex-1 text-[13px] leading-relaxed text-muted-foreground">
          {workspace.description}
        </p>

        {/* Specs footer */}
        <div className="mt-1 flex items-center gap-3.5 border-t border-border-subtle pt-3 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Cpu className="size-3.5 text-muted-foreground/60" />
            {workspace.cores} vCPU
          </span>
          <span className="inline-flex items-center gap-1.5">
            <MemoryStick className="size-3.5 text-muted-foreground/60" />
            {(workspace.memMb / 1024).toFixed(1)} GB
          </span>
          {workspace.activeSessions > 0 && (
            <span className="ml-auto inline-flex items-center gap-1.5 font-medium text-success">
              <span className="size-1.5 rounded-full bg-success animate-pulse-ring" />
              {workspace.activeSessions}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
