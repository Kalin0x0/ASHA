import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale } from './locales';

type Messages = Record<string, unknown>;

/**
 * Non-default locales are deep-merged over English so an incomplete
 * translation renders the English string instead of a raw key. This is what
 * makes "copy the en folder and translate at your own pace" safe.
 */
function mergeMessages(base: Messages, overrides: Messages): Messages {
  const out: Messages = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    const prev = out[key];
    out[key] =
      value && prev && typeof value === 'object' && typeof prev === 'object' && !Array.isArray(value)
        ? mergeMessages(prev as Messages, value as Messages)
        : value;
  }
  return out;
}

export default getRequestConfig(async () => {
  const store = await cookies();
  const cookieLocale = store.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(cookieLocale) ? cookieLocale : DEFAULT_LOCALE;

  const base = (await import(`../../messages/${DEFAULT_LOCALE}/index`)).default as Messages;
  const messages =
    locale === DEFAULT_LOCALE
      ? base
      : mergeMessages(base, (await import(`../../messages/${locale}/index`)).default as Messages);

  return { locale, messages };
});
