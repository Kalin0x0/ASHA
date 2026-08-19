import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { TENANT_SCOPED_MODELS } from './index';

/**
 * The Prisma client extension injects `where: { orgId }` for every model listed
 * in TENANT_SCOPED_MODELS. A model that carries a NON-NULLABLE `orgId` but is
 * missing from that set gets no automatic scoping at all — it then depends
 * entirely on every service remembering to filter by hand, and one forgotten
 * `where` is a cross-tenant read.
 *
 * An audit found eight such models. This test reads the schema through the
 * generated DMMF so the set cannot drift again: add a tenant-owned model and
 * this fails until it is registered.
 */
describe('tenant scoping is complete', () => {
  const models = Prisma.dmmf.datamodel.models;

  /** Models whose `orgId` is required — i.e. genuinely tenant-owned rows. */
  const tenantOwned = models
    .filter((m) => m.fields.some((f) => f.name === 'orgId' && f.isRequired && f.kind === 'scalar'))
    .map((m) => m.name);

  it('finds tenant-owned models in the schema (guards against a broken DMMF read)', () => {
    expect(tenantOwned.length).toBeGreaterThan(20);
  });

  it('every model with a required orgId is registered for auto-scoping', () => {
    const missing = tenantOwned.filter((name) => !TENANT_SCOPED_MODELS.has(name));

    expect(
      missing,
      `These models carry a required orgId but are NOT in TENANT_MODELS, so the Prisma ` +
        `extension will not scope them: ${missing.join(', ')}. Add them to packages/db/src/index.ts.`,
    ).toEqual([]);
  });

  it('does not register models that have no orgId to scope by', () => {
    const known = new Set(models.map((m) => m.name));
    const scopedButUnscopable = [...TENANT_SCOPED_MODELS].filter(
      (name) => known.has(name) && !tenantOwned.includes(name),
    );

    // A model listed here without a required orgId would have `orgId` injected
    // into queries it cannot satisfy — a silent "no rows" or a runtime error.
    expect(scopedButUnscopable).toEqual([]);
  });

  it('lists only models that actually exist in the schema', () => {
    const known = new Set(models.map((m) => m.name));
    const unknown = [...TENANT_SCOPED_MODELS].filter((name) => !known.has(name));

    // A renamed or deleted model left in the set is dead config that reads like
    // protection.
    expect(unknown).toEqual([]);
  });
});
