# Asha — Plan & Architecture

This is the authoritative plan. For the live backlog see [`TODO.md`](TODO.md); for
decisions and gotchas see [`MEMORY.md`](MEMORY.md).

## Intent

Build an original, modern container-streaming / VDI / DaaS platform — a functional
**superset of Kasm Workspaces**, but better, more optimized, with a first-class admin
dashboard. Original implementation only; reuse OSS streaming components (KasmVNC,
noVNC, guacamole-lite) as runtime images, never as copied source.

## User-approved decisions

1. **TypeScript end-to-end** (NestJS + Node agent + Next.js).
2. First milestone = **foundation + UI showpiece + a real streaming slice** (not full
   Kasm parity at once).
3. Deploy = **Docker Compose now + Helm skeleton in parallel**.
4. Design = **anthracite `#1a1a2e` + gold `#d4af37`** (the user's global brand standard).

## Topology

```
Browser ──https──► Traefik (edge + per-session dynamic routing via container labels)
                     ├── web   (Next.js admin + portal)
                     ├── api   (NestJS manager: REST + WS, OpenAPI /api/docs)
                     └── /session/<kasmId> ──► session container (KasmVNC)
   api ──► postgres (Prisma)   api/agent ──► redis (pub/sub)   agent ──► Docker Engine
```

Networks: `asha-edge` (Traefik⇄web/api), `asha-core` (⇄postgres/redis),
`asha-sessions` (Traefik⇄ephemeral session containers).

## Launch → stream flow

1. `POST /api/v1/sessions` → authz (`SESSION_LAUNCH`) → license check → `Session(REQUESTED)`.
2. `SchedulerService` picks the least-loaded fresh ONLINE agent in the zone → `SCHEDULED`.
3. Manager publishes a `ProvisionCommand` on `asha:zone:<zone>:provision` (Redis).
4. Agent pulls the image, computes **Traefik labels** (`@asha/proxy-labels`), `docker run`s
   the KasmVNC container on `asha-sessions`.
5. Traefik picks up labels from the Docker event stream (~1 s, no reload); a `sess-auth`
   forward-auth middleware guards the route.
6. Agent probes readiness → `POST /internal/agents/:id/sessions/:sid/status RUNNING`. Manager
   mints a short-lived session JWT, composes the connection URL, emits `session.ready` over WS.
7. Portal embeds the stream. Idle/keepalive/usage limits → destroy command → container removed,
   route disappears automatically.

## Multi-tenancy

Every tenant-owned row carries `orgId`. Three enforcement layers:
1. Prisma client extension injects `where:{orgId}` from `AsyncLocalStorage` (set by
   `TenantInterceptor`).
2. orgId-scoped unique indexes.
3. Postgres RLS as a Phase-3 backstop.

## Module map (API)

Built: `auth` (JWT+refresh, 2FA/SSO code-present-disabled), `sessions` (+scheduler +WS gateway),
`agents` (register/heartbeat/status/stats + admin), `workspaces`, `catalog` (zones/users/
settings/branding reads), `health`. Cross-cutting: `JwtAuthGuard`, `PermissionsGuard`,
`TenantInterceptor`, `RedisService`, `AuditService`.

Not yet built (schema exists): groups/roles CRUD, registry, images mgmt, recording, staging,
casting, sharing, servers, server pools, autoscale, VM/DNS providers, storage, file mappings,
settings/branding write, webhooks, reporting, audit read, config import/export, db admin.

## Phased roadmap

- **Phase 1 — DONE.** Monorepo, full data model, design system, admin dashboard + portal +
  streaming viewer, auth/RBAC/tenant, sessions/agents/workspaces, dockerode agent, Compose +
  Traefik + Helm skeleton. Build-verified.
- **Phase 2 — connection breadth + collaboration + persistence.** guacamole-lite + guacd
  (RDP/VNC/SSH), session sharing & chat, recording → S3, persistent profiles, file mappings,
  servers (SSH/tmux), 2FA (TOTP/WebAuthn) + CAPTCHA.
- **Phase 3 — identity, scale, multi-zone, hardening.** Full OIDC/SAML/LDAP, multi-zone +
  staging + casting, server pools + autoscale (schedule/load/AD) + VM providers (**Proxmox
  first**) + DNS providers, Postgres RLS + docker-socket-proxy, audit/license/reporting/
  webhooks/config-portability.
- **Phase 4 — enterprise edge + Kubernetes.** Storage mappings (Dropbox/GDrive/OneDrive/
  Nextcloud), browser isolation, web filtering, egress, browser pass-through, PWA, Helm/k8s
  driver + HPA (sessions as Pods + per-session Ingress), Windows/RDS, STIG hardening.

## The 5 hardest parts (watch these)

1. Per-session dynamic routing + websocket stream auth on an ephemeral container.
2. Docker socket = host blast radius (socket-proxy + unprivileged agent in Phase 3).
3. Scheduler/autoscale correctness across zones (Redis lock + DB status CAS).
4. guacamole-lite + guacd lifecycle + token secrecy (Phase 2).
5. Multi-tenant isolation (extension + indexes + RLS; CI test under two orgs).
