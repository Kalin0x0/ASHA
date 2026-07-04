'use client';

import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Liquid-glass surface — an Apple-style layered glass panel: a refraction layer
 * (backdrop blur + an optional SVG turbulence/displacement warp), a frost tint,
 * a beveled inner rim (the "liquid" edge highlight) and a slow specular sheen.
 * Content sits crisp above all of it.
 *
 * Theme-aware via the `--glass-*` tokens in globals.css (works in light + dark).
 * The heavy displacement `filter` is opt-in (`distort`) — use it on ONE hero
 * surface (the dock); everywhere else the blur + tint + bevel already read as
 * glass, without the per-surface filter cost.
 *
 * Requires <GlassFilter/> mounted once on the page when `distort` is used.
 */
export function LiquidGlass({
  children,
  className,
  style,
  radius = 'rounded-3xl',
  tint,
  distort = false,
  sheen = true,
  clip = true,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** Rounding utility applied to the panel (layers inherit it). */
  radius?: string;
  /** Override the frost tint (defaults to the theme's --glass-tint). */
  tint?: string;
  /** Apply the SVG refraction warp (hero surfaces only). */
  distort?: boolean;
  /** Show the slow sweeping specular highlight. */
  sheen?: boolean;
  /**
   * Clip content to the panel. Turn OFF where children must escape the panel
   * (e.g. the dock's tooltips, running-dots and launch bounce); the glass layers
   * still self-round via border-radius, so the panel stays glassy either way.
   */
  clip?: boolean;
}) {
  const inherit: CSSProperties = { borderRadius: 'inherit' };
  return (
    <div
      className={cn('relative isolate', clip && 'overflow-hidden', radius, className)}
      style={{ boxShadow: 'var(--glass-shadow)', ...style }}
    >
      {/* 1 — refraction: blur + saturate the wallpaper behind, optionally warped */}
      <div
        aria-hidden
        className="absolute inset-0 z-0"
        style={{
          ...inherit,
          backdropFilter: 'blur(7px) saturate(1.6)',
          WebkitBackdropFilter: 'blur(7px) saturate(1.6)',
          filter: distort ? 'url(#asha-glass-distortion)' : undefined,
        }}
      />
      {/* 2 — frost tint */}
      <div aria-hidden className="absolute inset-0 z-10" style={{ ...inherit, background: tint ?? 'var(--glass-tint)' }} />
      {/* 3 — beveled rim (the liquid edge highlight) */}
      <div aria-hidden className="absolute inset-0 z-20" style={{ ...inherit, boxShadow: 'var(--glass-bevel)' }} />
      {/* 4 — slow specular sheen */}
      {sheen && (
        <div aria-hidden className="pointer-events-none absolute inset-0 z-20 overflow-hidden" style={inherit}>
          <div
            className="animate-glass-sheen absolute inset-y-0 -left-1/3 w-1/3"
            style={{
              background: 'linear-gradient(90deg, transparent, var(--glass-sheen), transparent)',
            }}
          />
        </div>
      )}
      {/* Content */}
      <div className="relative z-30">{children}</div>
    </div>
  );
}

/**
 * The shared SVG filter that powers the liquid-glass refraction warp. Mount it
 * ONCE per page (it is display:none and referenced by id). Kept modest so glass
 * edges shimmer without smearing the content behind them.
 */
export function GlassFilter() {
  return (
    <svg aria-hidden className="pointer-events-none absolute size-0" width="0" height="0">
      <defs>
        <filter id="asha-glass-distortion" x="0%" y="0%" width="100%" height="100%" filterUnits="objectBoundingBox">
          <feTurbulence type="fractalNoise" baseFrequency="0.001 0.006" numOctaves="1" seed="17" result="turb" />
          <feGaussianBlur in="turb" stdDeviation="2.4" result="softMap" />
          <feDisplacementMap
            in="SourceGraphic"
            in2="softMap"
            scale="90"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>
    </svg>
  );
}
