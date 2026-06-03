import localFont from 'next/font/local';

/**
 * Editorial display serif — headings, KPI numbers, auth hero.
 * Full Fraunces variable axes (wght · opsz · SOFT · WONK).
 */
export const fraunces = localFont({
  src: [
    {
      path: '../../node_modules/@fontsource-variable/fraunces/files/fraunces-latin-full-normal.woff2',
      style: 'normal',
    },
    {
      path: '../../node_modules/@fontsource-variable/fraunces/files/fraunces-latin-full-italic.woff2',
      style: 'italic',
    },
  ],
  variable: '--font-fraunces',
  display: 'swap',
  weight: '100 900',
});

/** Space Grotesk — modern technical geometric, distinctive headings. */
export const spaceGrotesk = localFont({
  src: '../../node_modules/@fontsource-variable/space-grotesk/files/space-grotesk-latin-wght-normal.woff2',
  variable: '--font-space-grotesk',
  display: 'swap',
  weight: '300 700',
});

/** Sora — clean geometric sans, premium feel. */
export const sora = localFont({
  src: '../../node_modules/@fontsource-variable/sora/files/sora-latin-wght-normal.woff2',
  variable: '--font-sora',
  display: 'swap',
  weight: '100 800',
});

/** Manrope — soft modern sans, friendly + refined. */
export const manrope = localFont({
  src: '../../node_modules/@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2',
  variable: '--font-manrope',
  display: 'swap',
  weight: '200 800',
});
