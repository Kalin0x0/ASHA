# Asha — Architecture Overview

Asha is an original, self-hosted container-streaming / VDI / DaaS platform — a
functional superset of Kasm Workspaces, built from scratch. It is **not** a copy
of any proprietary codebase; genuinely open-source streaming components
(KasmVNC, noVNC, guacamole-lite) are consumed only as unmodified runtime images.

## Topology

```
Browser ──https──► Traefik (edge + per-session dynamic routing)
                     ├── web   (Next.js admin + portal)
                     ├── api   (NestJS manager: REST + WS, OpenAPI /api/docs)
                     └── /session/<kasmId>  ──► session container (KasmVNC)
                                                       ▲ docker run
   api ──► postgres (Prisma)   api/agent ──► redis (pub/sub)   agent ──► Docker Engine
```

## The launch → stream flow

1. `POST /api/v1/sessions` → authz (`SESSION_LAUNCH`) → license check → create
   `Session(REQUESTED)`.
2. `SchedulerService` picks the least-loaded ONLINE agent in the zone with a
   fresh heartbeat → `SCHEDULED`.
3. Manager publishes a `ProvisionCommand` on `asha:zone:<zone>:provision` (Redis).
4. Agent pulls the image, computes **Traefik labels** (`@asha/proxy-labels`),
   `docker run`s the KasmVNC container on the `asha-sessions` network.
5. Traefik picks up the labels from the Docker event stream (~1 s, no reload) and
   publishes the route; a `sess-auth` forward-auth middleware guards it.
6. Agent probes readiness → `POST /internal/agents/:id/sessions/:sid/status RUNNING`.
   The manager mints a short-lived session JWT, composes the connection URL, and
   emits `session.ready` over the WebSocket gateway.
7. The portal embeds the stream. Idle / keepalive / usage limits drive a destroy
   command; the container is removed and its route disappears automatically.

## Multi-tenancy

Every tenant-owned row carries `orgId`. Isolation is enforced in three layers:
a Prisma client extension that injects `where:{orgId}` from `AsyncLocalStorage`
(set by `TenantInterceptor`), orgId-scoped unique indexes, and Postgres RLS as a
Phase-3 backstop.

## Phase status

- **Phase 1 (done):** monorepo, full data model (~65 models), the Asha design
  system + admin dashboard + portal + streaming viewer, JWT auth + RBAC + tenant
  scoping, sessions/agents/workspaces modules, the dockerode agent lifecycle,
  Docker Compose + Traefik routing, Helm skeleton.
- **Phase 2–4:** RDP/VNC/SSH via guacamole-lite, recording, sharing, persistent
  profiles, full OIDC/SAML/LDAP, multi-zone + autoscale + VM providers (Proxmox
  first), storage mappings, browser isolation, Kubernetes driver, Windows/RDS.

See the approved plan for the full roadmap and the per-module breakdown.
