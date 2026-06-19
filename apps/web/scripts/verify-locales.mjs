#!/usr/bin/env node
/**
 * Locale smoke test: renders every route in every registered language against
 * a running dev/prod server and verifies (1) HTTP status, (2) html lang/dir
 * attributes, (3) no raw translation keys leaked into markup, (4) a
 * locale-specific marker string actually rendered (sidebar nav for admin
 * pages, header for portal, heading for login).
 *
 *   pnpm --filter @asha/web dev   # in another terminal
 *   node scripts/verify-locales.mjs [baseUrl]
 */
const BASE = process.argv[2] ?? 'http://localhost:3000';

const LOCALES = [
  { code: 'en', dir: 'ltr', admin: 'Infrastructure', portal: 'My Workspaces', login: 'Sign in' },
  { code: 'de', dir: 'ltr', admin: 'Infrastruktur', portal: 'Meine Workspaces', login: 'Anmelden' },
  { code: 'fa', dir: 'rtl', admin: 'زیرساخت', portal: 'فضاهای کاری من', login: 'ورود' },
];

const ADMIN_ROUTES = [
  '/dashboard',
  '/workspaces',
  '/workspaces/images',
  '/registry',
  '/sessions',
  '/sessions/sess-1',
  '/sessions/history',
  '/sessions/recordings',
  '/sessions/staging',
  '/sessions/casting',
  '/sessions/sharing',
  '/users',
  '/groups',
  '/roles',
  '/authentication',
  '/infrastructure/zones',
  '/infrastructure/agents',
  '/infrastructure/servers',
  '/infrastructure/server-pools',
  '/infrastructure/autoscale',
  '/infrastructure/vm-providers',
  '/infrastructure/dns-providers',
  '/storage/mappings',
  '/storage/profiles',
  '/storage/volumes',
  '/storage/file-mappings',
  '/connectivity/proxies',
  '/connectivity/web-filtering',
  '/connectivity/browser-isolation',
  '/connectivity/egress',
  '/settings/general',
  '/settings/security',
  '/settings/branding',
  '/settings/banners',
  '/settings/licensing',
  '/settings/database',
  '/settings/config',
  '/observability/reporting',
  '/observability/audit-log',
  '/observability/metrics',
  '/observability/log-forwarding',
  '/developer/api-keys',
  '/developer/webhooks',
  '/developer/api-docs',
];

const ROUTES = [
  ...ADMIN_ROUTES.map((path) => ({ path, marker: 'admin' })),
  { path: '/', marker: 'portal' },
  { path: '/session/sess-1', marker: null }, // viewer chrome is client-rendered
  { path: '/login', marker: 'login' },
];

// A rendered raw key looks like "sessions.list.title" in visible text.
const NAMESPACES =
  '(access|auth|common|connectivity|dashboard|developer|infrastructure|observability|portal|sessions|settings|shell|storage|viewer|workspaces)';
const KEY_LEAK = new RegExp(`[>"']${NAMESPACES}\\.[a-z][a-zA-Z]*\\.[a-zA-Z][a-zA-Z.]*[<"']`);

let failures = 0;
let checked = 0;

for (const locale of LOCALES) {
  let localeFailures = 0;
  for (const { path, marker } of ROUTES) {
    checked += 1;
    const problems = [];
    try {
      const res = await fetch(BASE + path, {
        headers: { cookie: `asha-locale=${locale.code}` },
        redirect: 'manual',
      });
      if (res.status !== 200) problems.push(`HTTP ${res.status}`);
      const html = await res.text();

      const attrs = html.match(/<html[^>]*>/)?.[0] ?? '';
      if (!attrs.includes(`lang="${locale.code}"`)) problems.push(`lang!=${locale.code}`);
      if (!attrs.includes(`dir="${locale.dir}"`)) problems.push(`dir!=${locale.dir}`);

      const leak = html.match(KEY_LEAK);
      if (leak) problems.push(`key leak: ${leak[0]}`);

      if (marker && !html.includes(locale[marker])) {
        problems.push(`marker "${locale[marker]}" missing`);
      }
    } catch (err) {
      problems.push(String(err));
    }

    if (problems.length) {
      failures += 1;
      localeFailures += 1;
      console.log(`✗ [${locale.code}] ${path} — ${problems.join('; ')}`);
    }
  }
  if (!localeFailures) console.log(`✓ [${locale.code}] all ${ROUTES.length} routes OK`);
}

console.log(`\n${checked} page renders checked, ${failures} failing`);
process.exit(failures ? 1 : 0);
