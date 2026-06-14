-- ============================================================================
-- Chista — Postgres Row-Level Security backstop for multi-tenant isolation
-- ============================================================================
--
-- PURPOSE
-- -------
-- The Prisma tenant extension (packages/db/src/index.ts) already injects
-- orgId filters at the application layer. This RLS layer adds a database-level
-- backstop: even if a service-layer bug omits an orgId check, Postgres will
-- reject cross-tenant reads and writes.
--
-- HOW IT WORKS
-- ------------
-- The application must set `app.current_org_id` before executing queries:
--
--   -- Inside a transaction (SET LOCAL — reverts when transaction ends):
--   SET LOCAL app.current_org_id = '<org-uuid>';
--   SELECT * FROM "Session" WHERE id = '<session-uuid>';  -- only sees own-org rows
--
--   -- Or session-scoped (less safe with connection pooling):
--   SET app.current_org_id = '<org-uuid>';
--
-- When `app.current_org_id` is empty (migrations, health checks, agent paths),
-- the permissive fallback policy allows all rows — RLS is a backstop, not the
-- primary auth mechanism.
--
-- ACTIVATION
-- ----------
-- 1. Apply this script to the database:
--      psql "$DATABASE_URL" -f packages/db/prisma/rls/tenant_isolation.sql
--
-- 2. Create an application-scoped Postgres role (recommended for production):
--      CREATE ROLE chista_app LOGIN PASSWORD '...';
--      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO chista_app;
--      ALTER DEFAULT PRIVILEGES IN SCHEMA public
--        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO chista_app;
--      -- RLS is only enforced for non-owner roles (without FORCE ROW LEVEL SECURITY).
--      -- If using the same role as the schema owner, add FORCE ROW LEVEL SECURITY per table.
--
-- 3. Set DATABASE_URL to connect as chista_app.
--
-- NOTES
-- -----
-- - Uses `current_setting('app.current_org_id', TRUE)` — the `TRUE` flag means
--   "return '' if missing" rather than raising an error.
-- - The permissive fallback (`= ''`) means RLS is a no-op when the setting is
--   not configured; the application layer remains the primary enforcement point.
-- - With PgBouncer in transaction mode, use SET LOCAL inside every transaction.
--   With session-mode pooling, SET (session-scoped) is sufficient.
-- ============================================================================

-- ── Helper function ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION current_org_id() RETURNS text
  LANGUAGE sql STABLE
  AS $$
    SELECT current_setting('app.current_org_id', TRUE);
  $$;

-- ── Enable RLS + create policies for every tenant-owned table ────────────────
-- Pattern per table:
--   1. ENABLE ROW LEVEL SECURITY  (turns RLS on for non-owner roles)
--   2. CREATE POLICY tenant_isolation … USING (permissive when unset, scoped when set)
-- The policy is PERMISSIVE so it combines with any future restrictive policies.

DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'DeploymentZone', 'User', 'ApiKey', 'Group',
    'AuthConfig', 'LoginConfig', 'CaptchaConfig',
    'Workspace', 'Session', 'Recording',
    'SessionShare', 'SessionStaging',
    'CastingConfig', 'CastErrorPage',
    'Agent', 'Server', 'ServerPool', 'AutoscaleConfig',
    'VMProvider', 'DNSProvider',
    'ConnectionProxyConfig', 'EgressGateway',
    'WebFilterConfig', 'BrowserIsolationConfig',
    'StorageMapping', 'FileMapping', 'PersistentProfile', 'VolumeMapping',
    'BannerWatermarkConfig', 'Webhook',
    'MetricSample', 'LogForwarderConfig', 'ConfigExportBundle',
    'Feedback'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    -- Enable RLS (safe to run multiple times — idempotent)
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);

    -- Drop existing policy if re-running the script
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', tbl);

    -- Permissive policy:
    --   • When app.current_org_id is '' (not set): allow all rows (migration/unscoped paths)
    --   • When set: only allow rows belonging to the current org
    EXECUTE format(
      $policy$
        CREATE POLICY tenant_isolation ON %I
          AS PERMISSIVE
          FOR ALL
          USING (
            current_org_id() = ''
            OR org_id = current_org_id()
          )
          WITH CHECK (
            current_org_id() = ''
            OR org_id = current_org_id()
          )
      $policy$,
      tbl
    );

    RAISE NOTICE 'RLS enabled on table %', tbl;
  END LOOP;
END;
$$;
