import localFont from 'next/font/local';

/** Editorial display serif — headings, KPI numbers, auth hero. */
export const fraunces = localFont({
  src: [
    {
      path: '../../node_modules/@fontsource-variable/fraunces/files/fraunces-latin-wght-normal.woff2',
      style: 'normal',
    },
    {
      path: '../../node_modules/@fontsource-variable/fraunces/files/fraunces-latin-wght-italic.woff2',
      style: 'italic',
    },
  ],
  variable: '--font-fraunces',
  display: 'swap',
  weight: '100 900',
});
