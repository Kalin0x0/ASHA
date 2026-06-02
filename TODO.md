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
- [x] Embed verification (runtime smoke test): production `next start` serves
      every route 200; the viewer renders the placeholder + setup hint when no
      stream is configured, and embeds a real `<iframe src=…>` (with fullscreen/
      clipboard capabilities) when `NEXT_PUBLIC_DEMO_STREAM_URL` is set. Visual
      confirmation against a live `kasmweb/*` container needs a host with Docker
      + a browser (not available in the build sandbox).

---

## Phase 2 — Connectivity, sharing, persistence

- [~] `@chista/connection-proxy` app — guacamole-lite bridge for RDP/VNC/SSH
      Scaffold complete: HTTP+WS server, JWT auth, Redis session store, protocol
      router. Guacamole TCP bridge wired (needs guacd sidecar); SSH stub with
      placeholder terminal message. docker-compose service + Traefik labels added.
- [x] Session sharing + chat — `SharingModule`: owner creates/revokes a share
      (`POST/DELETE /sessions/:id/share`), guests join via public share key
      (`/share/:key/join|leave|messages`), chat fans out over the WS gateway
      (`share.chat` / `share.participant` events). Viewer has a Share button that
      copies the invite link. 8 unit tests.
- [x] Session recording to S3 — `RecordingsModule`: list/get/playback/delete
      (`/recordings`), agent-driven begin/addArtifact/finalize lifecycle, S3
      config in env (presigned playback when configured, not-configured marker
      otherwise). Recordings admin page is now data-driven.
- [x] Persistent profiles, volume + file mappings — `StorageModule`: full
      org-scoped CRUD for `/storage/{volumes,files,profiles}` (updateMany/
      deleteMany guard). 6 unit tests.
- [x] 2FA/TOTP — real TOTP enrollment + verification in the API
      POST /auth/2fa/totp/enroll → secret + QR data URL
      POST /auth/2fa/totp/confirm → verify first code, mark confirmed
      DELETE /auth/2fa/totp → disable
      Login now verifies TOTP via otplib when a confirmed method exists.
      CAPTCHA deferred.
- [x] Admin **Access** pages real: Users (live table), Groups (derived from
      memberships), Roles (permission matrix from `@chista/rbac`) — no new API
      endpoints needed; work in mock + live.
- [x] Admin pages: Images, History, Recordings, Sharing
- [x] Storage: persistent profiles, volume/file mappings UI + API
      Pages: /storage/profiles, /storage/volumes, /storage/file-mappings.
      Backend: StorageModule with org-scoped CRUD (see above).

**Phase 2 is complete.** 82 tests, 21 typecheck tasks, 13 build tasks all green.

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

### Verified at runtime
- [x] Production server boots and serves all routes (`/`, `/login`, `/dashboard`,
      `/workspaces`, `/sessions`, `/users`, `/groups`, `/roles`, agents, viewer)
      with HTTP 200, on the real build (mock mode, no backend).
- [x] Streaming viewer embeds a real `<iframe>` when a stream URL is configured;
      falls back to the branded placeholder otherwise.

### Fixed (continued)
- [x] **Google Fonts TLS failure in build sandbox.** `next/font/google` fetches Fraunces
      at build time; the sandbox proxy injects a self-signed cert causing
      `SELF_SIGNED_CERT_IN_CHAIN`. Switched to `@fontsource-variable/fraunces` +
      `next/font/local` — identical visual output, zero network dependency at build time.

### Fixed (Phase 2 backend review)
- [x] **BigInt 500 on recordings endpoints.** `Recording.bytes` is a Prisma
      BigInt; `JSON.stringify` throws on BigInt, so any `/recordings` response
      would 500. Added a global `BigInt.prototype.toJSON` (→ string) in main.ts.
- [x] **Cross-tenant share read.** `getForSession` / `listForSession` queried by
      `sessionId` only — an admin with SESSION_SHARE in org A could read org B's
      share config + chat. Now org-scoped (`findFirst({ sessionId, orgId })`).
- [x] **Session-existence leak on share-create.** `create` checked the owner
      before the org, so a foreign session returned a different error than a
      missing one. Now a foreign session is reported as "not found" (org check
      first), closing the enumeration vector.

### Known gaps (documented, deferred by design)
- [ ] **Tenant isolation on update/delete-by-PK.** The Prisma tenant extension
      auto-scopes reads + `create`, but `update`/`delete` by unique id are not
      org-scoped (they rely on service-layer checks). Postgres RLS is the
      intended backstop — Phase 3 security hardening.
- [ ] Refresh-token reuse/family replay detection is not enforced (Phase 3).
