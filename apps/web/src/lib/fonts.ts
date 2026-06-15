import localFont from 'next/font/local';

/**
 * Space Grotesk — the display typeface: modern, geometric, distinctive.
 * Wired to `--font-display` in globals.css and used for h1–h4, `.font-display`,
 * and KPI numbers. The UI/body face is Geist Sans and numerics use Geist Mono
 * (both injected in layout.tsx); no other display families are needed.
 */
export const spaceGrotesk = localFont({
  src: '../../node_modules/@fontsource-variable/space-grotesk/files/space-grotesk-latin-wght-normal.woff2',
  variable: '--font-space-grotesk',
  display: 'swap',
  weight: '300 700',
});
