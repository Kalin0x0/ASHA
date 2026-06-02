import localFont from 'next/font/local';

/**
 * Editorial display serif — headings, KPI numbers, auth hero.
 * Uses the FULL Fraunces variable axes (wght · opsz · SOFT · WONK) so we can
 * dial in an elegant high-contrast optical size with softened terminals
 * (see `--font-variation-settings` on `.font-display` in globals.css).
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
