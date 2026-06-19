#!/usr/bin/env node
/**
 * Verifies message-catalog parity: every locale must have the same key tree
 * as English. Missing keys are WARNINGS (they fall back to English at
 * runtime); keys that don't exist in English are ERRORS (dead weight /
 * typos). Run: pnpm --filter @asha/web i18n:check
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const messagesDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'messages');
const BASE = 'en';

function flatten(obj, prefix = '', out = new Set()) {
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) flatten(value, path, out);
    else out.add(path);
  }
  return out;
}

function loadLocale(locale) {
  const dir = join(messagesDir, locale);
  const merged = {};
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
    merged[file.replace(/\.json$/, '')] = JSON.parse(readFileSync(join(dir, file), 'utf8'));
  }
  return merged;
}

const locales = readdirSync(messagesDir).filter((entry) =>
  statSync(join(messagesDir, entry)).isDirectory(),
);

if (!locales.includes(BASE)) {
  console.error(`Base locale "${BASE}" not found in ${messagesDir}`);
  process.exit(1);
}

const baseKeys = flatten(loadLocale(BASE));
console.log(`Base locale ${BASE}: ${baseKeys.size} keys`);

let failed = false;
for (const locale of locales.filter((l) => l !== BASE)) {
  const keys = flatten(loadLocale(locale));
  const missing = [...baseKeys].filter((k) => !keys.has(k));
  const extra = [...keys].filter((k) => !baseKeys.has(k));

  console.log(`\n${locale}: ${keys.size} keys`);
  if (missing.length) {
    console.log(`  ⚠ ${missing.length} missing (will fall back to English):`);
    for (const k of missing.slice(0, 20)) console.log(`    - ${k}`);
    if (missing.length > 20) console.log(`    … and ${missing.length - 20} more`);
  }
  if (extra.length) {
    failed = true;
    console.log(`  ✗ ${extra.length} keys not present in ${BASE} (typo or dead key?):`);
    for (const k of extra.slice(0, 20)) console.log(`    - ${k}`);
    if (extra.length > 20) console.log(`    … and ${extra.length - 20} more`);
  }
  if (!missing.length && !extra.length) console.log('  ✓ complete');
}

process.exit(failed ? 1 : 0);
