'use client';

import { Check, Languages } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LOCALES } from '@/i18n/locales';
import { setLocale } from '@/i18n/set-locale';
import { cn } from '@/lib/utils';

/**
 * Language picker. Persists the choice in a cookie via a server action and
 * refreshes the tree so server + client components re-render in the new
 * locale. New languages registered in `@/i18n/locales` appear automatically.
 */
export function LanguageSwitcher() {
  const t = useTranslations('shell.topbar');
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const choose = (code: string) => {
    if (code === locale) return;
    startTransition(async () => {
      await setLocale(code);
      router.refresh();
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t('language')}
          className={cn(pending && 'opacity-60')}
        >
          <Languages className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        {LOCALES.map((l) => (
          <DropdownMenuItem key={l.code} onSelect={() => choose(l.code)}>
            <span className="flex-1">{l.label}</span>
            {l.code === locale && <Check className="size-3.5 text-gold-300" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
