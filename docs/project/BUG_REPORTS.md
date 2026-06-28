# Bug reports & the central fix-memory

Chista ships a built-in bug tracker with a twist: every resolution is written
into a durable **fix memory** so the same problem is never diagnosed twice —
and the whole surface is plain REST, so **Claude Code (or any other UI/agent)
can read open bugs and fix them, then record _what_ it was and _how_ it was
fixed.**

## The pieces

| Concern | Where |
| --- | --- |
| Data model | `packages/db/prisma/schema.prisma` → `BugReport`, `BugFix` (+ enums `BugSource`, `BugSeverity`, `BugStatus`, `FixAuthorKind`) |
| API | `apps/api/src/modules/bug-reports/*` (`@Controller('bug-reports')`) |
| Auto-capture (API) | `apps/api/src/common/all-exceptions.filter.ts` (global `APP_FILTER`) |
| Auto-capture (web) | `apps/web/src/components/composite/error-reporter.tsx` (window handlers) + `app/(admin)/error.tsx` + `app/global-error.tsx` (React boundaries) |
| Report-a-bug UI | `apps/web/src/components/composite/report-bug-dialog.tsx` (topbar) |
| Triage UI | `/observability/bug-reports` (list + detail/resolve dialog) |
| Fix memory UI | `/observability/knowledge-base` |
| Permissions | `@chista/rbac`: `BUG_VIEW`, `BUG_MANAGE` (category `Support`) |

## Two intakes, one tracker

- **`source = USER`** — a person files a report from the topbar “Report a bug”
  dialog. Needs no special permission (any authenticated user can report).
- **`source = AUTOMATIC`** — an unexpected crash is captured with an **error
  code** and **error log**:
  - API: the global exception filter records every unhandled 5xx, returns a
    clean JSON 500 carrying a quotable `errorCode`, and writes the stack +
    route to a `BugReport`. Expected 4xx pass through untouched.
  - Web: `window.onerror` / `unhandledrejection` and the React error
    boundaries report render/runtime failures.

Recurrences are **deduped by `fingerprint`** (a normalized sha256 of
component + error name + message + top stack frame): instead of a new row,
`occurrences` and `lastSeenAt` are bumped.

## The memory

When a report is resolved, the resolver records **root cause** (what it was)
and **resolution** (how it was fixed) — optionally prevention notes, touched
files, tags, and whether an AI authored it. That becomes a `BugFix` carrying
the report's `fingerprint`.

The next time a matching error appears, `GET /bug-reports/:id` returns a
`knownFix` for it, and the matched fix's `reusedCount` is bumped. The
knowledge base lists every documented fix, searchable.

## API — read & fix (base path `/api/v1`)

All endpoints are bearer-authenticated. Swagger: `/api/docs`.

| Method & path | Permission | Purpose |
| --- | --- | --- |
| `POST /bug-reports` | _(any user)_ | File a report (`title`, `description`, `severity?`, `route?`) |
| `POST /bug-reports/ingest` | _(any user)_ | Auto-intake for a captured client error |
| `GET /bug-reports` | `BUG_VIEW` | List/triage. Filters: `status`, `severity`, `source`, `q` |
| `GET /bug-reports/stats` | `BUG_VIEW` | Counts (open / critical / automatic / resolved / knowledge) |
| `GET /bug-reports/:id` | `BUG_VIEW` | One report **plus `knownFix`** (the memory) |
| `PATCH /bug-reports/:id` | `BUG_MANAGE` | Update `status` / `severity` |
| `POST /bug-reports/:id/resolve` | `BUG_MANAGE` | Resolve **and document the fix** |
| `GET /bug-reports/knowledge` | `BUG_VIEW` | The fix memory (searchable via `q`) |

### How an AI agent works the queue

```bash
# 1. What's open?
GET /api/v1/bug-reports?status=OPEN

# 2. Read one — did we solve this before?
GET /api/v1/bug-reports/<id>        # → report + knownFix (if any)

# 3. Fix it in code, then document the fix into memory:
POST /api/v1/bug-reports/<id>/resolve
{
  "rootCause":  "what it actually was",
  "resolution": "the change that fixed it",
  "prevention": "how to avoid recurrence (optional)",
  "filesTouched": ["apps/api/...", "apps/web/..."],
  "authoredBy": "AI",
  "authorName": "Claude Code",
  "tags": ["api", "null-safety"]
}
```

If the same crash recurs later, step 2 surfaces this resolution automatically —
the agent reapplies the known fix instead of re-investigating.

## Notes

- `BugReport.orgId` / `BugFix.orgId` are nullable (like `AuditLog`) so
  unauthenticated crashes are still captured; both are scoped at the service
  layer, not the Prisma tenant extension.
- Seed data (`packages/db/prisma/seed.ts`) ships one resolved bug with its
  documented fix and one open auto-captured crash, so the pages are populated
  out of the box. The web mock store mirrors this for UI-only dev.
