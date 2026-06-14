/**
 * Wallpaper catalog — a Kasm-style "change your background" feature, used across
 * the whole app (portal + admin).
 *
 * Two kinds of preset:
 *  - photo  → a bundled nature photo (`src`, served from /public). The default.
 *  - bloom  → coloured radial blooms (`image`) over the theme background
 *             (`.bg-wallpaper`), staying in the anthracite + gold system.
 *
 * Readability is handled in CSS: `.bg-wallpaper` and the scrims are theme-aware
 * (dark tint in dark mode, light tint in light mode), so text stays legible over
 * any wallpaper in either theme.
 */
export interface BackgroundPreset {
  /** Stable id; display name resolves via `portal.appearance.presets.<id>`. */
  id: string;
  /** Photo wallpaper asset (public path). When set, this is a photo preset. */
  src?: string;
  /** Radial blooms (CSS background-image) for bloom presets + swatch tint. */
  image?: string;
  /** Overlay the faint reference grid (bloom presets only). */
  grid: boolean;
}

export const DEFAULT_BACKGROUND_ID = 'woods';

export const BACKGROUNDS: readonly BackgroundPreset[] = [
  // ── Nature photos (bundled) ────────────────────────────────────────────────
  { id: 'woods', src: '/backgrounds/nature-forest.jpg', grid: false },
  { id: 'lake', src: '/backgrounds/nature-lake.jpg', grid: false },
  // ── Colour blooms ──────────────────────────────────────────────────────────
  {
    id: 'aurora',
    image:
      'radial-gradient(60% 55% at 18% 20%, rgba(212,175,55,0.18), transparent 60%),' +
      'radial-gradient(55% 50% at 82% 26%, rgba(106,143,196,0.14), transparent 62%),' +
      'radial-gradient(50% 48% at 72% 78%, rgba(176,127,196,0.12), transparent 64%),' +
      'radial-gradient(72% 62% at 38% 108%, rgba(212,175,55,0.10), transparent 72%)',
    grid: true,
  },
  {
    id: 'ember',
    image:
      'radial-gradient(60% 55% at 20% 18%, rgba(224,168,74,0.20), transparent 60%),' +
      'radial-gradient(55% 50% at 84% 30%, rgba(212,108,72,0.14), transparent 62%),' +
      'radial-gradient(70% 60% at 45% 110%, rgba(212,175,55,0.14), transparent 70%)',
    grid: true,
  },
  {
    id: 'nebula',
    image:
      'radial-gradient(60% 55% at 22% 20%, rgba(176,127,196,0.20), transparent 60%),' +
      'radial-gradient(55% 50% at 82% 28%, rgba(124,131,212,0.16), transparent 62%),' +
      'radial-gradient(60% 55% at 60% 105%, rgba(196,112,143,0.12), transparent 68%)',
    grid: true,
  },
  {
    id: 'ocean',
    image:
      'radial-gradient(60% 55% at 18% 22%, rgba(106,143,196,0.20), transparent 60%),' +
      'radial-gradient(55% 50% at 84% 26%, rgba(95,184,143,0.12), transparent 62%),' +
      'radial-gradient(70% 60% at 40% 108%, rgba(124,131,212,0.12), transparent 70%)',
    grid: true,
  },
  {
    id: 'forest',
    image:
      'radial-gradient(60% 55% at 20% 20%, rgba(95,184,143,0.18), transparent 60%),' +
      'radial-gradient(55% 50% at 82% 30%, rgba(106,143,196,0.10), transparent 62%),' +
      'radial-gradient(70% 60% at 45% 110%, rgba(212,175,55,0.08), transparent 70%)',
    grid: true,
  },
  {
    id: 'crimson',
    image:
      'radial-gradient(60% 55% at 20% 18%, rgba(210,104,95,0.18), transparent 60%),' +
      'radial-gradient(55% 50% at 84% 30%, rgba(196,112,143,0.14), transparent 62%),' +
      'radial-gradient(70% 60% at 45% 110%, rgba(212,175,55,0.08), transparent 70%)',
    grid: true,
  },
  {
    id: 'graphite',
    image:
      'radial-gradient(70% 60% at 30% 12%, rgba(212,175,55,0.07), transparent 66%),' +
      'radial-gradient(60% 55% at 80% 90%, rgba(255,255,255,0.03), transparent 64%)',
    grid: true,
  },
  {
    id: 'void',
    image: 'radial-gradient(80% 70% at 50% 0%, rgba(26,26,46,0.65), transparent 70%)',
    grid: false,
  },
] as const;

/** Resolve a preset id to its definition, falling back to the default. */
export function backgroundById(id: string): BackgroundPreset {
  return BACKGROUNDS.find((b) => b.id === id) ?? BACKGROUNDS[0]!;
}
