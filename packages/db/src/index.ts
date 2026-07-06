import { AsyncLocalStorage } from 'node:async_hooks';
import { PrismaClient } from '@prisma/client';

// Re-export all generated Prisma types/enums so the rest of the monorepo has a
// single import surface: `import { SessionStatus, type Session } from '@asha/db'`.
export * from '@prisma/client';

// ─────────────────────────────────────────────────────────────────────────────
// Tenant context (request-scoped). The API sets this in an interceptor; the
// Prisma extension below reads it to auto-scope every tenant-owned query.
// ─────────────────────────────────────────────────────────────────────────────

export interface TenantContext {
  orgId?: string;
  actorUserId?: string;
  actorApiKeyId?: string;
  /** When true the extension performs no orgId injection (internal/agent paths). */
  unscoped?: boolean;
}

const storage = new AsyncLocalStorage<TenantContext>();

export function runWithTenant<T>(ctx: TenantContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function getTenantContext(): TenantContext | undefined {
  return storage.getStore();
}

/** Run a callback with tenant scoping disabled (e.g. login-by-email, agent sync). */
export function runUnscoped<T>(fn: () => T): T {
  return storage.run({ unscoped: true }, fn);
}

// Models that carry a NON-NULL `orgId` and are therefore safe to auto-scope.
// Models with a nullable orgId (global rows: Role, Image, Setting, Branding,
// License, AuditLog…) are intentionally excluded and scoped at the service layer.
const TENANT_MODELS = new Set<string>([
  'DeploymentZone',
  'User',
  'ApiKey',
  'Group',
  'AuthConfig',
  'LoginConfig',
  'CaptchaConfig',
  'Workspace',
  'Session',
  'Recording',
  'SessionShare',
  'SessionStaging',
  'CastingConfig',
  'CastErrorPage',
  'Agent',
  'Server',
  'ServerPool',
  'AutoscaleConfig',
  'VMProvider',
  'DNSProvider',
  'ConnectionProxyConfig',
  'EgressGateway',
  'WebFilterConfig',
  'BrowserIsolationConfig',
  'StorageMapping',
  'FileMapping',
  'PersistentProfile',
  'VolumeMapping',
  'BannerWatermarkConfig',
  'Webhook',
  'MetricSample',
  'LogForwarderConfig',
  'ConfigExportBundle',
  'Tariff',
  'TariffAssignment',
]);

// Batch operations: wrap where in AND so orgId is added as an extra filter.
const SCOPED_BATCH_OPS = new Set([
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'updateMany',
  'deleteMany',
  'count',
  'aggregate',
  'groupBy',
]);

// Single-record operations: inject orgId directly into where.
// Prisma accepts extra (non-unique) fields in findUnique/update/delete where clauses
// and generates `WHERE id = ? AND org_id = ?` SQL — closing the PK-bypass gap.
const SCOPED_UNIQUE_OPS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'update',
  'delete',
]);

function buildClient() {
  const base = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

  return base.$extends({
    name: 'tenant-scope',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const ctx = getTenantContext();
          const orgId = ctx?.orgId;

          if (orgId && !ctx?.unscoped && model && TENANT_MODELS.has(model)) {
            const a = (args ?? {}) as Record<string, unknown>;

            if (SCOPED_BATCH_OPS.has(operation)) {
              a.where = { AND: [a.where ?? {}, { orgId }] };
              return query(a as never);
            }

            if (SCOPED_UNIQUE_OPS.has(operation)) {
              // Inject orgId into the unique where so the generated SQL becomes
              // WHERE id = ? AND org_id = ?, preventing cross-tenant PK lookups.
              a.where = { ...((a.where as Record<string, unknown>) ?? {}), orgId };
              return query(a as never);
            }

            if (operation === 'create') {
              // orgId LAST so the tenant context always wins over any
              // caller-supplied data.orgId (mirrors the read/update branches).
              a.data = { ...(a.data as Record<string, unknown>), orgId };
              return query(a as never);
            }
          }

          return query(args as never);
        },
      },
    },
  });
}

export type AshaPrisma = ReturnType<typeof buildClient>;

const globalForPrisma = globalThis as unknown as { __ashaPrisma?: AshaPrisma };

export const prisma: AshaPrisma = globalForPrisma.__ashaPrisma ?? buildClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__ashaPrisma = prisma;
}
