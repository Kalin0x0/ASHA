import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';

/**
 * Every incremental migration adds columns the schema is supposed to describe.
 * The two are written by hand and applied at different times — `prisma migrate
 * deploy` runs the SQL, the client is generated from the schema — so a column
 * that exists in only one of them fails at runtime and nowhere else: the schema
 * promises a field the database has not got, or the database carries a column
 * nothing reads.
 *
 * This reads the SQL and the generated model description and compares them.
 * `0_init` creates the tables rather than altering them and adds no columns, so
 * it contributes nothing here.
 */
const MIGRATIONS = fileURLToPath(new URL('../prisma/migrations', import.meta.url));

/** `ALTER TABLE "X" ADD COLUMN "y" TYPE …;` — table, column, and the rest. */
const ADD_COLUMN = /ALTER TABLE\s+"(\w+)"\s+ADD COLUMN\s+"(\w+)"\s+([^;]+);/g;

interface AddedColumn {
  migration: string;
  table: string;
  column: string;
  notNull: boolean;
}

function addedColumns(): AddedColumn[] {
  const found: AddedColumn[] = [];
  for (const dir of readdirSync(MIGRATIONS, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const sql = readFileSync(join(MIGRATIONS, dir.name, 'migration.sql'), 'utf8');
    for (const [, table, column, rest] of sql.matchAll(ADD_COLUMN)) {
      found.push({
        migration: dir.name,
        table: table!,
        column: column!,
        notNull: /\bNOT NULL\b/i.test(rest!),
      });
    }
  }
  return found;
}

describe('the migrations and the schema describe the same columns', () => {
  const columns = addedColumns();
  const models = Prisma.dmmf.datamodel.models;
  /** Prisma maps a model to its `@@map` name where it has one, else its own. */
  const byTable = new Map(models.map((m) => [m.dbName ?? m.name, m]));

  it('finds the added columns (guards against a regex that matches nothing)', () => {
    expect(columns.map((c) => `${c.table}.${c.column}`)).toEqual(
      expect.arrayContaining(['WorkspaceUser.denied', 'Server.keyboardLayout']),
    );
  });

  it('has a model and a field for every column a migration adds', () => {
    const orphans = columns.filter((c) => {
      const model = byTable.get(c.table);
      return !model || !model.fields.some((f) => (f.dbName ?? f.name) === c.column);
    });
    expect(
      orphans.map((c) => `${c.migration}: ${c.table}.${c.column}`),
      'These columns are added by a migration but described by no field in schema.prisma',
    ).toEqual([]);
  });

  it('agrees with the schema on which of them are nullable', () => {
    // A column the database lets be NULL while the schema calls the field
    // required reads back as a type error at best and a crash at worst — and
    // the reverse silently rejects the rows the schema says are fine.
    const disagreements = columns.flatMap((c) => {
      const field = byTable.get(c.table)?.fields.find((f) => (f.dbName ?? f.name) === c.column);
      if (!field) return [];
      return field.isRequired === c.notNull ? [] : [`${c.migration}: ${c.table}.${c.column}`];
    });
    expect(disagreements, 'NOT NULL in the migration must match a required field, and vice versa').toEqual([]);
  });
});
