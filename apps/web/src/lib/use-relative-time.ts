import { useLocale } from 'next-intl';
import { useHydrated } from '@/lib/use-hydrated';

/**
 * "3 min ago" / "vor 3 Min." / "۳ دقیقه پیش", in the viewer's language and
 * against the viewer's clock — so it is empty until the browser renders (the
 * server's clock and locale would print something the browser then contradicts).
 *
 * Replaces the English-only `formatRelativeTime` on pages a person reads.
 */
export function useRelativeTime(): (date: Date | string | number) => string {
  const locale = useLocale();
  const hydrated = useHydrated();
  return (date) => {
    if (!hydrated) return '';
    const at = typeof date === 'object' ? date : new Date(date);
    const diff = (at.getTime() - Date.now()) / 1000;
    const abs = Math.abs(diff);
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' });
    if (abs < 45) return rtf.format(0, 'second');
    if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
    if (abs < 86_400) return rtf.format(Math.round(diff / 3600), 'hour');
    if (abs < 30 * 86_400) return rtf.format(Math.round(diff / 86_400), 'day');
    return rtf.format(Math.round(diff / (30 * 86_400)), 'month');
  };
}
