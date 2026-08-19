/**
 * Schema deployment for the db-migrate one-shot container.
 *
 * Replaces `prisma db push --accept-data-loss`, which ran on EVERY stack start
 * and silently destroyed data on any schema-narrowing change, with no history
 * and no operator prompt.
 *
 * The tricky part is existing installations: they were provisioned by `db push`
 * and therefore have a full schema but no `_prisma_migrations` table. Running
 * `migrate deploy` there would try to CREATE tables that already exist and the
 * stack would never come up. So:
 *
 *   empty database            → migrate deploy (creates everything)
 *   schema, no migration log  → baseline it (`migrate resolve --applied 0_init`),
 *                               then migrate deploy for anything newer
 *   migration log present     → migrate deploy (the normal path)
 */
import { execFileSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

const BASELINE = '0_init';

function prisma(...args) {
  execFileSync('pnpm', ['exec', 'prisma', ...args], { stdio: 'inherit' });
}

const db = new PrismaClient();
try {
  const [{ has_log }] = await db.$queryRaw`
    SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS has_log`;
  const [{ table_count }] = await db.$queryRaw`
    SELECT count(*)::int AS table_count
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`;

  if (!has_log && table_count > 0) {
    console.log(
      `[db-migrate] Found ${table_count} existing tables but no migration history — ` +
        `baselining as ${BASELINE} (no data is touched).`,
    );
    prisma('migrate', 'resolve', '--applied', BASELINE);
  } else if (!has_log) {
    console.log('[db-migrate] Empty database — applying migrations from scratch.');
  }
} finally {
  await db.$disconnect();
}

prisma('migrate', 'deploy');
