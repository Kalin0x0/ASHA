# Chista — TODO / Open Work

Living backlog. Tick items as you complete them. Priority: 🔴 critical · 🟠 important · 🟡 nice.
For the why/how see [`PLAN.md`](PLAN.md); for decisions/gotchas see [`MEMORY.md`](MEMORY.md).

## 🔴 Phase-1 loose ends (do these first — they make the real stack work & secure)

- [ ] **1. Wire web ↔ live API.** Web currently runs on its own mock store
      (`apps/web/src/lib/mock`) with `NEXT_PUBLIC_API_MODE=mock`. To go live:
  - [ ] generate types: `openapi-typescript` from the API's OpenAPI (`/api/docs-json`) → `apps/web/src/lib/api/schema.d.ts`
  - [ ] typed client with `openapi-fetch` → `apps/web/src/lib/api/client.ts` (+ query-key factory, domain hooks)
  - [ ] swap the mock hooks in `apps/web/src/lib/hooks.ts` for live TanStack Query hooks behind the `NEXT_PUBLIC_API_MODE` flag
  - [ ] real WebSocket client (`socket.io-client`) bridging events into the Query cache
- [ ] **2. Secure the session stream.** Add `GET /api/v1/internal/session-auth` that validates the
      short-lived session JWT, and point Traefik `sess-auth` middleware at it
      (`infra/traefik/dynamic/dynamic.yml`) instead of `/health/live`.
- [ ] **3. Enforce the agent token.** Validate `x-agent-token` on all `@AgentOnly()`
      `/internal/agents/*` routes (`apps/api/src/common` — add an `AgentTokenGuard` or check in
      controller). Add `CHISTA_AGENT_ENROLLMENT_TOKEN` to `@chista/config` env schema.

## 🟠 Verification & infra hardening

- [ ] **4. Run the real Docker loop.** `docker compose up -d --build`, then login → launch a KasmVNC
      workspace → confirm a container is created (`docker ps`), Traefik route comes up, noVNC streams,
      session shows in admin, terminate removes the container. Fix KasmVNC https `serversTransport`
      wiring if needed. (Not yet executed — written but untested.)
- [ ] **5. Real DB migrations.** Replace `prisma db push` (in `packages/db/Dockerfile` /
      `db-migrate`) with `prisma migrate` + a committed `migrations/` history.
- [ ] **6. Tests.** Vitest on `proxy-labels`, `SchedulerService`, RBAC guard; Playwright on
      launch → stream → terminate.
- [ ] **7. Hardening.** WS gateway token auth (not just `orgId` query); real license enforcement
      (currently permissive stub); enable 2FA (TOTP/WebAuthn) and SSO paths.

## 🟡 Admin pages to build for real (currently "coming soon" stubs)

Each route already exists via the catch-all; replace with a real page + its API module.

- [ ] Users (table + 7-tab detail) · Groups (limits/permissions/workspaces/SSO/file-mappings)
- [ ] **Roles & Permissions (RBAC matrix)** — high value, schema + `packages/rbac` ready
- [ ] Authentication (LDAP/SAML/OIDC/2FA/login/CAPTCHA)
- [ ] Registry · Images management
- [ ] Sessions: History · Recordings (+player) · Staging · Casting · Sharing
- [ ] Infrastructure: Zones (+ZoneMap) · Servers · Server Pools · **AutoScale schedule editor** ·
      VM Providers · DNS Providers
- [ ] Storage: Mappings · Profiles · Volumes · File Mappings
- [ ] Connectivity: Proxies · Web Filtering · Browser Isolation · Egress
- [ ] Settings: General · **Branding editor (live preview)** · Banners · Licensing · Database · Config
- [ ] Observability: Reporting · Audit Log · Metrics · Log Forwarding
- [ ] Developer: API Keys · Webhooks · API Docs

## Backend — API modules without a controller yet (schema exists)

- [ ] groups · roles · registry · images · recordings · staging · casting · sharing · servers ·
      server-pools · autoscale · vm-providers · dns-providers · storage · file-mappings ·
      settings-write · branding-write · webhooks · reporting · audit-read · config-portability · db-admin

## Phase 2–4 (the big roadmap — see PLAN.md)

- [ ] **Phase 2:** guacamole-lite + guacd (RDP/VNC/SSH), sharing/chat, recording+S3, persistent
      profiles, file mappings, servers, 2FA/CAPTCHA
- [ ] **Phase 3:** full OIDC/SAML/LDAP, multi-zone + staging + casting, server pools + autoscale +
      VM providers (Proxmox first) + DNS, RLS + socket-proxy, audit/license/reporting/webhooks/config
- [ ] **Phase 4:** storage mappings (Dropbox/GDrive/OneDrive/Nextcloud), browser isolation, web
      filtering, egress, browser pass-through, Kubernetes driver + HPA + Helm, Windows/RDS, STIG

---

### Recommended order for the next session

1. 🔴 1 (web↔API) → 🔴 2 (stream auth) → 🔴 3 (agent token)
2. 🟠 4 (verify the real Docker launch→stream loop end to end)
3. 🟡 Users/Groups/**RBAC matrix** pages + their API modules
4. Phase 2: the guacamole-lite RDP path
