/**
 * Per-app icon registry. Maps a workspace (by name / docker image / category)
 * to a bundled brand glyph + brand colour, so the launcher shows real app logos
 * (Firefox, Windows, Ubuntu, …) instead of initials. Glyphs are monochrome
 * SVGs (simple-icons + a Windows mark) rendered white on a brand-coloured tile
 * via CSS mask, so they stay crisp and on-theme. A workspace's own `iconUrl`
 * (custom upload/URL) always wins; unmatched apps fall back to the monogram.
 */
export interface AppIcon {
  /** Public path to the monochrome SVG glyph. */
  src: string;
  /** Brand colour for the tile background. */
  color: string;
}

const ICONS = {
  firefox: { src: '/icons/firefox.svg', color: '#FF7139' },
  chrome: { src: '/icons/chrome.svg', color: '#4285F4' },
  tor: { src: '/icons/tor.svg', color: '#7E4798' },
  ubuntu: { src: '/icons/ubuntu.svg', color: '#E95420' },
  debian: { src: '/icons/debian.svg', color: '#A81D33' },
  linux: { src: '/icons/linux.svg', color: '#1A1A2E' },
  kali: { src: '/icons/kali.svg', color: '#367BF0' },
  gimp: { src: '/icons/gimp.svg', color: '#5C5543' },
  blender: { src: '/icons/blender.svg', color: '#E87D0D' },
  libreoffice: { src: '/icons/libreoffice.svg', color: '#18A303' },
  postman: { src: '/icons/postman.svg', color: '#FF6C37' },
  terminal: { src: '/icons/terminal.svg', color: '#2B2B40' },
  vscode: { src: '/icons/vscode.svg', color: '#0078D7' },
  windows: { src: '/icons/windows.svg', color: '#0078D6' },
} satisfies Record<string, AppIcon>;

// Matched in order against the workspace's name + docker image + category.
// Order matters (e.g. kali before the generic linux fallback).
const ALIASES: Array<[RegExp, keyof typeof ICONS]> = [
  [/firefox/i, 'firefox'],
  [/chrome|chromium/i, 'chrome'],
  [/tor[\s-]?browser|\btor\b/i, 'tor'],
  [/windows|win[\s-]?(11|10|server|\d)|\brdp\b/i, 'windows'],
  [/kali/i, 'kali'],
  [/ubuntu/i, 'ubuntu'],
  [/debian/i, 'debian'],
  [/gimp/i, 'gimp'],
  [/blender/i, 'blender'],
  [/libre[\s-]?office/i, 'libreoffice'],
  [/postman/i, 'postman'],
  [/vs[\s-]?code|vscode|code[\s-]?server|codium/i, 'vscode'],
  [/terminal|shell|\bbash\b|\bssh\b|\bzsh\b/i, 'terminal'],
  [/linux/i, 'linux'],
];

/** Resolve an app icon from any of the given hints (name, image, category). */
export function resolveAppIcon(...hints: Array<string | undefined>): AppIcon | null {
  const hay = hints.filter(Boolean).join(' ');
  if (!hay) return null;
  for (const [re, key] of ALIASES) if (re.test(hay)) return ICONS[key];
  return null;
}
