import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PERMISSION_CATALOG } from './index';

/**
 * A permission key lives in three places that must agree:
 *
 *   1. `PERMISSION_CATALOG` here — what the product says exists.
 *   2. `packages/db/prisma/seed.ts` — the only writer of `Permission` rows, and
 *      therefore the only way a key can ever be attached to a role.
 *   3. `@RequirePermissions(...)` in the API controllers — what is demanded.
 *
 * Nothing enforced that, and all three pairings had already drifted:
 * `ORG_MANAGE` (SCIM tokens) and `WORKSPACE_MANAGE` (remote apps) were demanded
 * by controllers but absent from the catalog, and `MAINTENANCE_MANAGE` was in
 * the catalog but never seeded. The failure is silent and total: `RolesService`
 * filters every role assignment through the known keys, so a key missing from
 * the catalog or the seed can never be held by anyone, and the endpoint is
 * reachable by `isSystemAdmin` alone — while the admin UI happily shows the
 * permission as though ticking it did something.
 */

const ROOT = join(__dirname, '..', '..', '..');
const KEY_RE = /key:\s*'([A-Z_]+)'/g;
const keysIn = (source: string) => new Set([...source.matchAll(KEY_RE)].map((m) => m[1]!));

/** Every `@RequirePermissions` / `@RequireAnyPermission` argument in the API. */
function demandedByControllers(): Set<string> {
  const found = new Set<string>();
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
        const src = readFileSync(full, 'utf8');
        for (const call of src.matchAll(/Require(?:Any)?Permissions\(([^)]*)\)/g)) {
          for (const k of (call[1] ?? '').matchAll(/'([A-Z_]+)'/g)) found.add(k[1]!);
        }
      }
    }
  };
  walk(join(ROOT, 'apps', 'api', 'src'));
  return found;
}

describe('permission catalog', () => {
  const catalog = new Set(PERMISSION_CATALOG.map((p) => p.key));
  const seeded = keysIn(readFileSync(join(ROOT, 'packages', 'db', 'prisma', 'seed.ts'), 'utf8'));

  it('demands nothing the catalog does not define', () => {
    // A key here that is not in the catalog cannot be granted to any role, so
    // the endpoint silently becomes system-admin-only.
    expect([...demandedByControllers()].filter((k) => !catalog.has(k)).sort()).toEqual([]);
  });

  it('seeds every key it defines', () => {
    // The seed is the only writer of Permission rows. A catalog key missing here
    // has no row to attach, so no role can hold it however the UI presents it.
    expect([...catalog].filter((k) => !seeded.has(k)).sort()).toEqual([]);
  });

  it('seeds nothing the catalog does not define', () => {
    // The reverse drift: a stale row the product no longer knows about, which
    // RolesService would filter out of every assignment anyway.
    expect([...seeded].filter((k) => !catalog.has(k)).sort()).toEqual([]);
  });

  it('reads a non-trivial number of keys from each source', () => {
    // Guards the guard: if a regex stops matching, the three tests above pass
    // vacuously and the drift they exist to catch sails straight through.
    expect(catalog.size).toBeGreaterThan(30);
    expect(seeded.size).toBeGreaterThan(30);
    expect(demandedByControllers().size).toBeGreaterThan(30);
  });
});
