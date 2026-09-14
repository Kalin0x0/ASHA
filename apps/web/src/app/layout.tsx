import './globals.css';
import '@fontsource-variable/vazirmatn';
import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';
import type { Metadata, Viewport } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';
import { GrainOverlay } from '@/components/decor/aurora-background';
import { Providers } from '@/components/providers';
import { localeDir } from '@/i18n/locales';
import { spaceGrotesk } from '@/lib/fonts';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('common.meta');
  return {
    title: {
      default: 'Asha — Container Streaming Platform',
      template: '%s · Asha',
    },
    description: t('description'),
    applicationName: 'Asha',
    appleWebApp: {
      capable: true,
      title: 'Asha',
      statusBarStyle: 'black-translucent',
    },
    icons: {
      icon: [
        { url: '/favicon.ico', sizes: '48x48' },
        { url: '/icon-192.png', type: 'image/png', sizes: '192x192' },
        { url: '/icon-512.png', type: 'image/png', sizes: '512x512' },
      ],
      apple: '/apple-touch-icon.png',
      shortcut: '/favicon.ico',
    },
    openGraph: {
      title: 'Asha — Container Streaming Platform',
      description: t('description'),
      siteName: 'Asha',
      images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'Asha' }],
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: 'Asha — Container Streaming Platform',
      description: t('description'),
      images: ['/og-image.png'],
    },
  };
}

export const viewport: Viewport = {
  themeColor: '#1a1a2e',
  // Draw under the notch and the home indicator: without viewport-fit=cover the
  // safe-area insets the viewer's key bar relies on all report zero.
  viewportFit: 'cover',
  // Let a soft keyboard shrink the layout instead of covering it, so the on-screen
  // key bar stays above the keyboard rather than behind it.
  interactiveWidget: 'resizes-content',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      dir={localeDir(locale)}
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable} ${spaceGrotesk.variable}`}
    >
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <NextIntlClientProvider messages={messages}>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
        <GrainOverlay />
      </body>
    </html>
  );
}
