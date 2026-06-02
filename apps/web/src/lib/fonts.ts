import { Fraunces } from 'next/font/google';

/** Editorial display serif — headings, KPI numbers, auth hero. */
export const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  style: ['normal', 'italic'],
  variable: '--font-fraunces',
  display: 'swap',
});
