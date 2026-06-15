import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { AuroraBackground } from '@/components/decor/aurora-background';
import { ChistaMark } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  const t = useTranslations('shell.notFound');
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-6 overflow-hidden px-4 text-center">
      <AuroraBackground />
      <div className="relative z-10 flex flex-col items-center gap-5">
        <ChistaMark className="size-12" />
        <p className="font-display text-6xl font-medium text-gradient-gold">404</p>
        <div>
          <h1 className="font-display text-2xl font-medium">{t('title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('description')}</p>
        </div>
        <Button asChild>
          <Link href="/dashboard">{t('backToDashboard')}</Link>
        </Button>
      </div>
    </div>
  );
}
