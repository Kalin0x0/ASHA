import {
  AppWindow,
  Briefcase,
  Code2,
  Globe,
  type LucideIcon,
  Monitor,
  Palette,
  ShieldHalf,
} from 'lucide-react';

/**
 * Per-category visual identity for the workspace launcher. Gives the catalog a
 * Kasm-style colour-coded grid — every Browser is steel-blue, every Dev tool is
 * green, etc. — so users navigate by colour and icon at a glance.
 *
 * The accent is a single hex; the card derives its tints from it via `color-mix`
 * so the palette stays cohesive and the hero never becomes a heavy flat fill
 * ("gold is ink, not paint" — colour lives only in the app tile).
 */
export interface CategoryVisual {
  Icon: LucideIcon;
  /** Accent hex used to derive the hero gradient + glow. */
  accent: string;
}

const CATEGORY_VISUALS: Record<string, CategoryVisual> = {
  Browsers: { Icon: Globe, accent: '#6a8fc4' },
  Development: { Icon: Code2, accent: '#5fb88f' },
  Security: { Icon: ShieldHalf, accent: '#d2685f' },
  Creative: { Icon: Palette, accent: '#b07fc4' },
  Productivity: { Icon: Briefcase, accent: '#d4af37' },
  Desktops: { Icon: Monitor, accent: '#7c83d4' },
};

const FALLBACK: CategoryVisual = { Icon: AppWindow, accent: '#d4af37' };

export function categoryVisual(category: string): CategoryVisual {
  return CATEGORY_VISUALS[category] ?? FALLBACK;
}
