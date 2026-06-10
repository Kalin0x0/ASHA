'use client';

import { Clock, Cpu, Lock, MemoryStick, Play, Sparkles, Star } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { Monogram } from '@/components/composite/monogram';
import { Badge } from '@/components/ui/badge';
import { useThumbnails } from '@/lib/thumbnail-store';
import { categoryVisual } from '@/lib/workspace-visuals';
import type { Workspace } from '@/lib/types';
import { cn } from '@/lib/utils';

/**
 * Image-forward workspace tile — the launcher's centrepiece. Mirrors Kasm's
 * launch grid (a colour-coded app tile up top, metadata below, launch-on-hover)
 * while staying in the Chista anthracite + gold system. Click anywhere on an
 * enabled card to launch; the star and any drag handle stop propagation.
 *
 * When a previous-session thumbnail exists for this workspace (stored by the
 * streaming viewer on session end), it is shown as the hero background so the
 * user immediately sees what the workspace looked like last time they used it.
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
  const t = useTranslations('portal');
  const format = useFormatter();
  const { Icon, accent } = categoryVisual(workspace.category);
  const enabled = workspace.enabled;
  const protocolLabel = workspace.protocol === 'KASMVNC' ? 'KasmVNC' : workspace.protocol;
  const thumbEntry = useThumbnails((s) => s.thumbs[workspace.id]);

  const launch = () => {
    if (enabled && !launching) onLaunch?.(workspace.id);
  };

  return (
    <div
      role="button"
      tabIndex={enabled ? 0 : -1}
      aria-disabled={!enabled}
      aria-label={
        enabled
          ? t('card.launchAria', { name: workspace.friendlyName })
          : t('card.unavailableAria', { name: workspace.friendlyName })
      }
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
      {/* ── Hero ────────────────────────────────────────────────────── */}
      <div className="relative flex h-32 items-center justify-center overflow-hidden">

        {/* Background: last-session thumbnail OR category gradient */}
        {thumbEntry ? (
          <>
            {/* Screenshot of the last session, slightly blurred */}
            <div
              className="absolute inset-0 scale-105 bg-cover bg-center blur-[1px] brightness-50 transition-all duration-500 group-hover:brightness-[0.35] group-hover:scale-110"
              style={{ backgroundImage: `url('${thumbEntry.dataUrl}')` }}
              aria-hidden
            />
            {/* Gradient vignette so the monogram stays readable */}
            <div
              className="absolute inset-0"
              style={{
                background:
                  'radial-gradient(ellipse 70% 80% at 50% 50%, transparent 20%, rgba(14,14,26,0.55) 100%)',
              }}
              aria-hidden
            />
          </>
        ) : (
          /* No thumbnail yet — category-coloured gradient (default state) */
          <div
            className="absolute inset-0 transition-all duration-500"
            style={{
              background: `radial-gradient(120% 120% at 50% 0%, color-mix(in srgb, ${accent} 26%, transparent), transparent 70%), linear-gradient(160deg, color-mix(in srgb, ${accent} 14%, var(--surface-2)), var(--surface-1))`,
            }}
            aria-hidden
          />
        )}

        {/* Oversized category glyph watermark — fades if thumbnail exists */}
        <Icon
          className={cn(
            'pointer-events-none absolute -right-4 -top-3 size-28 transition-all duration-500 group-hover:scale-110',
            thumbEntry ? 'opacity-0' : 'opacity-[0.07]',
          )}
          style={{ color: accent }}
          aria-hidden
        />

        {/* App monogram (always visible, scales on hover) */}
        <Monogram
          name={workspace.friendlyName}
          className="relative z-10 size-16 rounded-2xl text-lg shadow-[0_8px_24px_-8px_rgba(0,0,0,0.7)] transition-transform duration-300 group-hover:scale-105"
        />

        {/* "Last session" badge — shown when thumbnail exists */}
        {thumbEntry && (
          <div className="on-dark absolute bottom-2 left-2 z-10 flex items-center gap-1 rounded-full bg-anthracite-950/70 px-2 py-0.5 backdrop-blur-sm">
            <Clock className="size-2.5 text-gold-300" />
            <span className="text-[10px] font-medium text-gold-300 tabular-nums">
              {format.relativeTime(new Date(thumbEntry.capturedAt))}
            </span>
          </div>
        )}

        {/* GPU badge */}
        {workspace.gpu > 0 && (
          <Badge variant="gold" className="absolute left-3 top-3 gap-1 z-10">
            <Sparkles className="size-3" /> {t('card.gpu')}
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
            aria-label={favorite ? t('card.removeFavorite') : t('card.addFavorite')}
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
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-anthracite-950/50 opacity-0 backdrop-blur-[2px] transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
            <span className="inline-flex items-center gap-2 rounded-full bg-gold-500 px-5 py-2 text-sm font-semibold text-anthracite-950 shadow-[0_8px_24px_-6px_rgba(212,175,55,0.6)] transition-transform duration-200 group-hover:scale-105">
              {launching ? (
                <>
                  <span className="size-4 animate-spin rounded-full border-2 border-anthracite-950/30 border-t-anthracite-950" />
                  {t('card.starting')}
                </>
              ) : (
                <>
                  <Play className="size-4 fill-anthracite-950" /> {t('card.launch')}
                </>
              )}
            </span>
          </div>
        ) : (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-anthracite-950/45">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-anthracite-900/80 px-3 py-1 text-xs font-medium text-muted-foreground">
              <Lock className="size-3" /> {t('card.unavailable')}
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
            {t('card.vcpu', { count: workspace.cores })}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <MemoryStick className="size-3.5 text-muted-foreground/60" />
            {t('card.gb', { value: (workspace.memMb / 1024).toFixed(1) })}
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
