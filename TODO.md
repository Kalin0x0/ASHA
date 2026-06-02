# Chista — Roadmap & TODO

Living checklist tracking the build-out phase by phase. Status legend:
`[x]` done · `[~]` partial / scaffolded · `[ ]` not started.

---

## Phase 1 — Foundation & the launch → stream showpiece

The monorepo, data model, design system, admin shell, and the end-user
launch → stream flow against a real KasmVNC container.

### Done
- [x] pnpm + turbo monorepo, shared tsconfig, 10 packages + 3 apps
- [x] Prisma data model (40+ models, multi-tenant, enums) + seed
- [x] Design system (Tailwind v4 + Radix, anthracite/gold, charts, components)
- [x] Admin shell: dashboard, live sessions, agent fleet, workspace catalog
- [x] End-user portal: workspace launcher
- [x] NestJS API: auth, sessions, workspaces, agents, catalog, health + WS gateway
- [x] RBAC: permission catalog, role matrix, policy evaluation
- [x] Agent: dockerode provision/destroy/stats + Redis command bus
- [x] proxy-labels, events, crypto, config, logger packages
- [x] Single-node docker-compose (traefik, postgres, redis, api, web, agent)
- [x] Helm skeleton (api + web deployments)
- [x] **Real KasmVNC stream in the session viewer** (iframe driven by live status)
- [x] **Test framework (Vitest) + unit suites** for rbac, proxy-labels, crypto,
      contracts, web stream helper (59 tests)
- [x] **CI pipeline** (typecheck · lint · test · build on push/PR)

### Remaining (to truly close Phase 1)
- [x] **Live API client in web** — `NEXT_PUBLIC_API_MODE=live` now selects a
      react-query data layer (`hooks.live`) that calls the NestJS API, joins
      sessions↔users/zones/agents/workspaces, and derives the dashboard. Mock
      stays the default. Auth context + token store + refresh + route guard.
- [x] **Real login** — login form calls `POST /auth/login` in live mode, stores
      the JWT pair, auto-refreshes on 401, and `AuthGate` guards admin/portal.
- [x] **API integration tests** — SessionsService create/terminate lifecycle
      (create → schedule → provision dispatch → terminate) with mocked
      Prisma/Redis/deps (9 new tests; 68 total).
- [x] **Workspace edit/delete** — `PATCH`/`DELETE /workspaces/:id` with
      org-scoped update/deleteMany + `updateWorkspaceSchema` (partial, no-op
      rejected).
- [x] Persist Traefik certs — `traefik-acme` named volume + documented opt-in
      Let's Encrypt resolver in docker-compose.
- [ ] Embed verification: run a real `kasmweb/*` container and confirm the
      viewer streams end to end. *(Phase-1 task #4 below)*

---

## Phase 2 — Connectivity, sharing, persistence

- [ ] `@chista/connection-proxy` app — guacamole-lite bridge for RDP/VNC/SSH
- [ ] Session sharing + chat (share rooms over the existing events channels)
- [ ] Session recording to S3-compatible storage
- [ ] Persistent profiles, volume + file mappings
- [ ] 2FA/TOTP (the auth stub) + CAPTCHA
- [ ] Admin pages: Images, History, Recordings, Sharing, Users, Groups, Roles
- [ ] Storage: persistent profiles, volume/file mappings UI + API

---

## Phase 3 — Identity, scale, hardening

- [ ] OIDC / SAML / LDAP authentication providers
- [ ] Multi-zone, staging, casting
- [ ] Server pools + autoscale + VM/DNS providers (Proxmox first)
- [ ] Security hardening (Postgres RLS backstop, CSP, rate limiting)
- [ ] Reporting + webhooks

---

## Phase 4 — Storage, isolation, Kubernetes, Windows

- [ ] Storage mappings, browser isolation / web filtering / egress
- [ ] Kubernetes driver: agent DaemonSet, ephemeral session pods, per-session
      ingress, HPA
- [ ] Windows / RDS workspaces

---

## Bug hunt (continuous)

Tracked findings from running the full repo (`typecheck · lint · test · build`)
and reading the runtime paths.

### Fixed
- [x] **Agent subscribed to the wrong zone channel.** The agent listened on
      `provision/destroy(CHISTA_ZONE)` (local env) while the manager publishes on
      the DB zone's `name`. When enrollment fell back to the default zone these
      differed and provision commands were silently lost. `register()` now
      returns the resolved zone name and the agent subscribes to that.
- [x] **2FA auth bypass.** `login()` only checked for the *presence* of a TOTP
      code, never verified it — any string passed. Now fails closed until real
      TOTP verification ships (Phase 2). Dormant in Phase 1 (no seed user has
      2FA), but the bypass is removed.

### Known gaps (documented, deferred by design)
- [ ] **Tenant isolation on update/delete-by-PK.** The Prisma tenant extension
      auto-scopes reads + `create`, but `update`/`delete` by unique id are not
      org-scoped (they rely on service-layer checks). Postgres RLS is the
      intended backstop — Phase 3 security hardening.
- [ ] Refresh-token reuse/family replay detection is not enforced (Phase 3).
