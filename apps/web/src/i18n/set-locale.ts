'use server';

import { cookies } from 'next/headers';
import { LOCALE_COOKIE, isLocale } from './locales';

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/** Persists the chosen language; the caller refreshes the router afterwards. */
export async function setLocale(locale: string): Promise<void> {
  if (!isLocale(locale)) return;
  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, { maxAge: ONE_YEAR_SECONDS, path: '/', sameSite: 'lax' });
}
