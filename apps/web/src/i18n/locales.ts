/**
 * Locale registry — the single place a new language is switched on.
 *
 * To add a language:
 *   1. Copy `apps/web/messages/en/` to `apps/web/messages/<code>/` (keep index.ts as-is).
 *   2. Translate the JSON files. Missing keys automatically fall back to English,
 *      so a partial translation is safe to ship.
 *   3. Add one entry below — the language switcher picks it up automatically.
 */
export const LOCALES = [
  { code: 'en', label: 'English' },
  { code: 'de', label: 'Deutsch' },
] as const;

export type Locale = (typeof LOCALES)[number]['code'];

export const DEFAULT_LOCALE: Locale = 'en';

/** Cookie that persists the user's language across visits (1 year). */
export const LOCALE_COOKIE = 'chista-locale';

export function isLocale(value: string | undefined): value is Locale {
  return LOCALES.some((l) => l.code === value);
}
