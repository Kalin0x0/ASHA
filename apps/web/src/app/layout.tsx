import './globals.css';
import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';
import type { Metadata, Viewport } from 'next';
import { GrainOverlay } from '@/components/decor/aurora-background';
import { Providers } from '@/components/providers';
import { fraunces } from '@/lib/fonts';

export const metadata: Metadata = {
  title: {
    default: 'Chista — Container Streaming Platform',
    template: '%s · Chista',
  },
  description:
    'Chista streams containerized desktops, browsers, and apps to any browser. Self-hosted, multi-tenant, enterprise-grade.',
  applicationName: 'Chista',
};

export const viewport: Viewport = {
  themeColor: '#1a1a2e',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable} ${fraunces.variable}`}
    >
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <Providers>{children}</Providers>
        <GrainOverlay />
      </body>
    </html>
  );
}
