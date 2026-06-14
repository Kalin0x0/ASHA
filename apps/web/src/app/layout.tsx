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
      default: 'Chista — Container Streaming Platform',
      template: '%s · Chista',
    },
    description: t('description'),
    applicationName: 'Chista',
    appleWebApp: {
      capable: true,
      title: 'Chista',
      statusBarStyle: 'black-translucent',
    },
    icons: {
      icon: [
        { url: '/chista-logo.svg', type: 'image/svg+xml' },
        { url: '/chista-logo.png', type: 'image/png' },
      ],
      apple: '/chista-logo.png',
      shortcut: '/chista-logo.png',
    },
  };
}

export const viewport: Viewport = {
  themeColor: '#1a1a2e',
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
