# CLAUDE.md — Asha project guide

> **Read this first.** Claude Code auto-loads this file. It is the entry point for
> every session. Detailed plan / open work / decisions live in [`docs/project/`](docs/project/).

## What Asha is

Asha is an **original, self-hosted container-streaming / VDI / DaaS platform** — a
functional **superset of Kasm Workspaces**, built from scratch. Persian/Zoroastrian
naming family (Asha = divinity of wisdom).

> ⚠️ **Do NOT reproduce Kasm proprietary code.** Kasm's core (manager/agent/web-UI) is
> closed-source and not on GitHub. We build an original implementation and reuse only
> genuinely open-source streaming parts (KasmVNC, noVNC, guacamole-lite) as **unmodified
> runtime container images**, never linked into our source.

## Stack & repo map

TypeScript end-to-end · pnpm + Turborepo monorepo.

| Path | Package | Purpose |
| --- | --- | --- |
| `apps/web` | `@asha/web` | Next.js 15 admin dashboard + end-user portal. **Showpiece.** Anthracite + gold design system. |
| `apps/api` | `@asha/api` | NestJS manager: REST + WS, JWT auth, RBAC, multi-tenant, Prisma, Swagger `/api/docs`. |
| `apps/agent` | `@asha/agent` | Node + dockerode: provisions/destroys KasmVNC session containers. |
| `packages/db` | `@asha/db` | Prisma schema (~65 models, entire feature surface) + client + seed. **Single source of truth.** |
| `packages/{rbac,proxy-labels,events,config,crypto,logger,contracts}` | shared libs (tsup-built) |
| `infra/` | Traefik dynamic config, Helm skeleton |
| `docs/project/` | **PLAN.md, TODO.md, MEMORY.md** — read these |

## Commands

```bash
pnpm install                              # bootstrap
pnpm --filter @asha/web dev             # UI only, mock data, no backend → http://localhost:3000
pnpm dev                                  # web + api + agent (Turbo watch)
pnpm --filter @asha/web build           # verify web
pnpm --filter @asha/api build           # verify api (nest build)
pnpm exec turbo run typecheck --concurrency=3   # typecheck whole repo
pnpm db:generate | db:migrate | db:seed   # Prisma lifecycle
docker compose up -d --build              # full stack (needs Docker + hosts entry asha.local)
```

**Build gotcha:** the shared-package `--dts` builds can OOM-crash (exit 134) when run fully
parallel. If `pnpm build` fails there, run `pnpm --filter "./packages/*" --workspace-concurrency=1 build`.
`@asha/db` (or any shared pkg) must be **built before** `api`/`agent` typecheck — they consume `dist/*.d.ts`.

## Current status (Phase 1 = DONE & build-verified)

**Built + verified:** monorepo, full Prisma schema, design system, admin shell (sidebar + ⌘K
palette + live dashboard), Sessions (list+detail), Workspaces, Agents, Login, Portal + streaming
viewer; API (auth/RBAC/tenant/sessions/agents/workspaces/health); agent dockerode lifecycle;
docker-compose + Traefik + Helm skeleton. `next build` ✓, `nest build` ✓, Turbo typecheck ✓.

**Stubbed (schema/route exists, no real impl yet):** most admin pages (Users/Groups/Roles/Auth/
Storage/Connectivity/Settings/Observability/Developer render a branded "coming soon"); many API
domains have no controller yet; RDP/SSH, recording, sharing, SSO, autoscale, VM providers, k8s.

## Conventions

- **Design:** anthracite `#1a1a2e` + gold `#d4af37`. Token system lives in `apps/web/src/app/globals.css`
  (Tailwind v4 `@theme`). Gold is "ink, not paint" — never large fills. Fraunces (display) + Geist (UI).
- **Multi-tenancy:** every tenant row has `orgId`; `TenantInterceptor` + Prisma extension auto-scope.
- **RBAC:** permission catalog in `packages/rbac`; `@RequirePermissions(...)` + `PermissionsGuard`.
- **Web data layer is currently DECOUPLED from the API** — it runs on a mock store
  (`apps/web/src/lib/mock`) via `NEXT_PUBLIC_API_MODE=mock`. Wiring it live is open work (see TODO 🔴1).
- **i18n (next-intl):** ALL UI text goes through message catalogs in `apps/web/messages/<locale>/*.json`
  (namespaces per area; `common.json` = shared vocabulary, statuses, actions). Locale = cookie
  (`asha-locale`), switcher in topbar/login. Never hardcode user-visible strings in components —
  use `useTranslations('<namespace>')`. Shipped: **en · de · fa** (Persian, RTL). **Add a language:**
  copy `messages/en/` → `messages/<code>/`, translate the JSON (missing keys fall back to English
  automatically), add one line in `apps/web/src/i18n/locales.ts` (set `dir: 'rtl'` for RTL scripts —
  the html `dir`, Radix `DirectionProvider`, Vazirmatn font and logical Tailwind classes handle
  mirroring; use `ms-/me-`, `ps-/pe-`, `text-start/end`, `start-/end-` insets in new UI, never
  `ml-/pl-/text-left/left-`). Validate with `pnpm --filter @asha/web i18n:check` (key parity) and
  `node apps/web/scripts/verify-locales.mjs` against a running server (per-route lang/dir + key-leak check).
- **Versioning:** the product version lives in `apps/web/src/lib/changelog.ts` (`CHANGELOG`
  newest-first → derived `CURRENT_VERSION`), shown in the sidebar footer + **Developer → Updates**.
  Bump it with **every merged update** — started at `1.0.9`, then `1.1.0 → 1.1.1 → 1.1.2 → …`;
  prepend a `Release` entry (version, date, added/fixed/changed) per merge. See MEMORY.md → Versioning.
- Admin seed login: `admin@asha.local` / `AshaAdmin!2026`.

## ➡️ Where to start each session

1. **[`docs/project/TODO.md`](docs/project/TODO.md)** — prioritized open work (🔴 first). This is the backlog.
2. **[`docs/project/PLAN.md`](docs/project/PLAN.md)** — architecture, request flow, phased roadmap.
3. **[`docs/project/MEMORY.md`](docs/project/MEMORY.md)** — decisions, environment facts, gotchas.

The highest-impact next work is TODO 🔴 1–3 (wire web↔API live, secure the session stream,
enforce the agent token), then 🟠 4 (run & verify the real Docker launch→stream loop).
