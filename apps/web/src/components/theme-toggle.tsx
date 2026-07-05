'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { themeTransition } from '@/lib/theme-transition';

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const t = useTranslations('shell');

  const isDark = resolvedTheme !== 'light';

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={t('themeToggle')}
      // The new theme sweeps in as a circle from the click point.
      onClick={(e) => themeTransition(() => setTheme(isDark ? 'light' : 'dark'), e)}
    >
      {mounted && !isDark ? <Moon className="size-4" /> : <Sun className="size-4" />}
    </Button>
  );
}
