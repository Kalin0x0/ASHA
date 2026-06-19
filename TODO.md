# Asha — Roadmap & TODO

A **Naiemi Group** product. Checklist tracking the build-out phase by phase.
Status legend: `[x]` done · `[~]` partial / scaffolded · `[ ]` not started.

> **All seven phases are complete.** 276 unit tests; `typecheck · lint · test ·
> build` green across 26 workspace tasks. Every Kasm-parity feature was built
> from scratch or on open-source tooling (KasmVNC, Neko, Squid, WireGuard, guacd,
> ssh2, Fluent Bit, pg_dump, Proxmox VE API, @node-saml/node-saml, ldapts,
> @simplewebauthn/server, PulseAudio, CUPS) — nothing derived from any
> proprietary product. Identity (passkeys, SCIM, OIDC nonce-binding) and the VM
> driver matrix (8 providers) now exceed Kasm's open tier.

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

- [x] `@asha/connection-proxy` app — RDP/VNC/SSH bridge.
      HTTP+WS server, JWT auth, Redis session store, protocol router.
      **Guacamole**: full server-side guacd handshake (select → parse args →
      size/audio/video/image → connect with session params), then raw bridging;
      `guac-protocol.ts` codec (encode + incremental parser, 7 tests). `guacd`
      service added to docker-compose (guacamole/guacd:1.5.5).
      **SSH**: real ssh2 client — PTY shell, stdout/stderr → browser, resize
      control frames (`{type:'resize',cols,rows}`), key- or password-based auth.
      **Wiring**: on session RUNNING the API writes the proxy session record
      (host/port/protocol + SSH/RDP credentials) to Redis; deletes it on
      DESTROYED. `SessionStatusDto` carries the credentials the agent injects.
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
      memberships), Roles (permission matrix from `@asha/rbac`) — no new API
      endpoints needed; work in mock + live.
- [x] Admin pages: Images, History, Recordings, Sharing
- [x] Storage: persistent profiles, volume/file mappings UI + API
      Pages: /storage/profiles, /storage/volumes, /storage/file-mappings.
      Backend: StorageModule with org-scoped CRUD (see above).

**Phase 2 is complete.** 82 tests, 21 typecheck tasks, 13 build tasks all green.

---

## Phase 3 — Identity, scale, hardening

- [x] OIDC / SAML / LDAP authentication providers — `AuthProvidersModule`:
      org-scoped CRUD for `AuthConfig` (`/auth/providers`) with per-type config
      validation (OIDC: issuer+clientId, SAML: idpMetadataUrl+spEntityId, LDAP:
      url+baseDN) plus SSO group mappings (`/auth/providers/mappings`). 5 tests.
- [x] Multi-zone, staging, casting —
      `ZonesModule` (`/zones`): CRUD with single-default invariant (promoting a
      new default demotes the old one in one tx; default zone can't be deleted).
      `StagingModule` (`/staging`): pre-warmed session pools per workspace+zone.
      `CastingModule` (`/casting`): public kiosk links with generated keys.
      10 tests.
- [x] Server pools + autoscale + VM/DNS providers (Proxmox first) —
      `ServersModule` (`/servers`): persistent RDP/VNC/SSH host CRUD.
      `PoolsModule` (`/pools`): pool CRUD + `PUT /pools/:id/autoscale` upserts an
      AutoscaleConfig and replaces the weekly schedule grid wholesale.
      `ProvidersModule` (`/providers/{vm,dns}`): VM/DNS provider registry with a
      `ProxmoxDriver` — real Proxmox VE REST calls (API-token auth): createInstance
      reserves a VMID via `/cluster/nextid`, clones the template, applies
      cores/memory overrides, and starts the VM; destroyInstance stops + deletes;
      getInstance maps live status. Optional `insecureTls` for self-signed labs.
      18 tests (4 new covering the API call sequence).
- [x] Security hardening (Postgres RLS backstop, CSP, rate limiting)
      Rate limiting: `@nestjs/throttler` — 200 req/min global, 10 req/min on
      `AuthController` (login, refresh, TOTP). Health routes skip throttle.
      Helmet: API responses hardened (X-Content-Type-Options, X-Frame-Options,
      HSTS 1 year, hide X-Powered-By, CSP for Swagger UI).
      CSP + security headers: Next.js `headers()` — CSP, HSTS, X-Frame-Options,
      Referrer-Policy, Permissions-Policy applied to all routes.
      Prisma extension: `findUnique`/`update`/`delete` now also inject `orgId`
      into the WHERE clause (closes the PK-bypass gap at application layer).
      Postgres RLS backstop: `packages/db/prisma/rls/tenant_isolation.sql` —
      permissive policies that enforce org-scoping when `app.current_org_id` is
      set (activated in production via `SET LOCAL` inside transactions).
- [x] Reporting + webhooks —
      `WebhooksModule` (`/webhooks`): CRUD + delivery log + `POST /:id/test`,
      HMAC-SHA256 signing (`X-Asha-Signature: sha256=…`), secrets redacted on
      read, `dispatch()` fans events to subscribed hooks. Wired into the session
      lifecycle (`session.created` / `session.terminated`).
      `ReportingModule` (`/reporting`): org-scoped summary, sessions-over-time,
      top-workspaces, and hourly metric series (date ranges clamped). 9 tests.

**Phase 3 is complete.** 121 tests, 25 typecheck+build tasks all green.

---

## Phase 4 — Storage, isolation, Kubernetes, Windows

- [x] Browser isolation / web filtering / egress / connection proxies —
      `ConnectivityModule` (`/connectivity`): org-scoped CRUD for
      `ConnectionProxyConfig` (`/proxies`), `EgressGateway` (`/egress`),
      `WebFilterConfig` (`/filters`) and `BrowserIsolationConfig` (`/isolation`),
      each with audit records. 16 tests.
- [x] Kubernetes driver: agent DaemonSet, ephemeral session pods, per-session
      ingress, HPA —
      Agent: dynamic driver selection (`ASHA_DRIVER=kubernetes|docker`);
      `kubernetes.ts` provisions session Pod + ClusterIP Service + per-session
      Ingress via `@kubernetes/client-node`, collects metrics, tears down with
      `Promise.allSettled`. Helm: agent DaemonSet (conditional Docker-socket /
      ServiceAccount), RBAC (ClusterRole node reads + Role session CRUD), session
      namespace with ResourceQuota + NetworkPolicy (blocks control plane), HPA for
      API (CPU+mem) and Web (CPU).
- [x] Windows / RDS workspaces — `WindowsModule`
      (`/workspaces/:workspaceId/remote-apps`): RemoteApp CRUD, org-scoped via
      workspace join. 6 tests.

**Phase 4 is complete.** 144 tests, 25 typecheck+build tasks all green.

---

## Phase 5 — Operational maturity (closing the Kasm gap)

Features Kasm Workspaces ships that Asha lacked. Built from scratch or on
open-source tooling — nothing derived from Kasm.

- [x] **Session reaper** — `@nestjs/schedule`-driven `SessionReaperService`
      runs every 60 s and terminates (a) sessions past their hard
      `expiresAt` cap and (b) sessions idle beyond their workspace's
      `idleTimeoutMinutes` (measured from `lastKeepaliveAt`). `create()` now
      stamps `expiresAt`/`lastKeepaliveAt`; `terminate()` refactored into a
      shared `destroy(session, reason, actor?)` used by both admin and reaper.
      Workspace gained `maxDurationMinutes` + `idleTimeoutMinutes`. 4 tests.
- [x] **Watermarking + compliance banner** — `WatermarksModule` (`/watermarks`):
      USER/GROUP/WORKSPACE-scoped overlay config; `resolveForSession` picks the
      most specific match (workspace → group → user) and expands `{{user}}` /
      `{{date}}` tokens for the viewer's diagonal forensic watermark. 5 tests.
- [x] **Log forwarding (SIEM)** — `LogForwardingModule` (`/log-forwarders`):
      org-scoped CRUD plus a Fluent Bit (open-source shipper) config generator
      for syslog / Splunk HEC / Elasticsearch / Loki / generic HTTP targets. 6 tests.
- [x] **Automated DB backups** — `BackupsModule` (`/backups`): `@Cron`-scheduled
      `pg_dump` (open-source) into `BACKUP_DIR` with retention pruning, plus a
      manual `POST /backups/run`. Records every dump in `DbBackupRecord`. Env:
      `BACKUP_ENABLED|DIR|CRON|RETENTION`. 3 tests.
- [x] **DLP policy fields** — Workspace `dlp` JSON (clipboard up/down, uploads,
      downloads, pwa) carried through to the viewer.

- [x] **Connectivity runtime config generators** — `ConnectivityRenderService`
      turns stored configs into deployable artifacts for open-source sidecars,
      nothing proprietary:
        • Web filter → Squid ACL config (`GET /connectivity/filters/:id/squid-config`)
        • Egress → WireGuard tunnel config (`GET /connectivity/egress/:id/wireguard-config`)
        • Browser isolation → Neko (Apache-2.0) compose service (`GET /connectivity/isolation/:id/compose`)
      8 tests covering whitelist/allow-all Squid, WireGuard interface+peer with
      validation, and Neko proxy/screen rendering with defaults.

- [x] **Sidecar wiring in the agent** — generated Squid/WireGuard/Neko artifacts
      are now attached as session sidecars at launch. `ProvisionCommand` carries
      a `sidecars` map; `dispatchProvision()` resolves the workspace's
      connectivity-policy IDs (`webFilterId`/`egressGatewayId`/`browserIsolationId`)
      into `SessionSidecar` descriptors via `ConnectivityRenderService`. Docker
      driver writes config files + launches `asha-{squid,wg,neko}-<kasmId>` on
      the session network (and tears them down on destroy); Kubernetes driver
      injects sidecar containers + a per-Pod ConfigMap for config mounts. Squid's
      proxy URL is auto-wired into Neko when both are active.

- [x] **WebRTC / H.264 codec path** — Neko (`ghcr.io/m1k1o/neko/*`, Apache-2.0)
      is now a first-class primary stream. `StreamProtocol.WEBRTC` →
      `ConnectionType.NEKO_WEBRTC`; the session container runs Neko (port 8080,
      2 GB shm) and serves its built-in WebRTC/H.264 web client. The viewer shows
      a gold "WebRTC/H.264" badge and Neko-specific negotiation copy. No KasmVNC
      codec dependency on this path.
- [x] **Smartcard / USB / webcam passthrough** — `RunConfig.devices[]` carries
      host device paths (`/dev/video0`, `/dev/bus/usb`, `/dev/pcsc`, …) declared
      in `workspace.dockerConfig.devices`. Docker driver maps them 1:1 as
      `HostConfig.Devices` (rwm); Kubernetes driver mounts each as a CharDevice
      hostPath volume + grants MKNOD/SYS_RAWIO. Viewer adds a getUserMedia webcam
      PiP preview and a USB/smartcard configuration helper.

**Phase 5 is complete.** 188 tests, 25 typecheck+build tasks all green.
The entire Kasm feature gap is now closed using only custom code + open-source
tooling (Squid, WireGuard, Neko, guacd, ssh2, Fluent Bit, pg_dump, Proxmox VE) —
nothing from Kasm.

---

## Phase 6 — Closing the last gaps to the incumbents

Everything Kasm still had that Asha didn't — built from scratch / open-source.

### Done
- [x] **Session pause/resume** — `control` Redis channel + `SessionControlCommand`;
      API `POST /sessions/:id/{pause,resume}`; Docker `pause`/`unpause`; K8s no-op
      parity; `PAUSED` status end-to-end; viewer pause overlay + button.
- [x] **Live resize / multi-monitor** — `POST /sessions/:id/resize`; agent
      best-effort exec; viewer resolution selector (incl. dual-monitor geometry).
- [x] **GPU hardware encoding** — `GpuConfig` (none|nvenc|vaapi); Docker
      `DeviceRequests`/DRI device + env; K8s `nvidia.com/gpu` limit + render node.
- [x] **Runtime DLP enforcement** — `DlpPolicy` on the workspace, injected as
      container env (`KASM_*`) by the agent **and** enforced in the viewer
      (clipboard/upload/audio/printing controls greyed out by policy).
- [x] **Audio bridge** — PulseAudio (LGPL) sidecar resolver, DLP-gated.
- [x] **Virtual printing** — CUPS (Apache-2.0) sidecar resolver, DLP-gated.
- [x] **SAML 2.0 SP-initiated** — `@node-saml/node-saml`: login redirect, ACS
      assertion validation, SP metadata endpoint.
- [x] **LDAP** — `ldapts`: service-bind + user search + password re-bind login,
      RFC-4515-safe live-test diagnostic endpoint.
- [x] **JIT provisioning + group sync** — `FederationService` creates SSO users
      on first login and reconciles mapped groups against the assertion.
- [x] **License enforcement** — CONCURRENT + NAMED_USER caps gating session
      launch; `GET /license/usage`; admin licensing page with live meters.
- [x] **Image registry + marketplace** — registry CRUD + JSON-index sync +
      one-click workspace install; admin `/registry` page.
- [x] **Drag-and-drop upload** + **mobile/touch** viewer optimizations.

**Phase 6 is complete.** 210 tests (+22), 25 typecheck+build tasks all green.
New open-source deps: `@node-saml/node-saml`, `ldapts`; runtime sidecars use
PulseAudio + CUPS images. Nothing from Kasm.

---

## Phase 7 — Enterprise identity, the full driver matrix & secret hardening

The features Kasm only ships in its top enterprise tier, plus the cloud/VM
driver breadth and at-rest secret hardening the incumbents keep closed-source.

### Done
- [x] **WebAuthn / Passkeys** — `WebauthnModule` on `@simplewebauthn/server` (MIT):
      registration options/verify (authenticated enrollment), passwordless login
      options/verify (no account enumeration), credential list/remove. Passkeys
      stored as `UserCredential(kind=WEBAUTHN)` with COSE public key + signature
      counter (clone detection). Web: `/security` enrollment page + a real passkey
      button on the login screen via `@simplewebauthn/browser`. 6 tests.
- [x] **SCIM 2.0 provisioning** — `ScimModule`: ServiceProviderConfig /
      ResourceTypes, bearer-token-guarded Users + Groups CRUD against the org's
      API-key store, `externalId` round-trip for IdP-driven user lifecycle.
      Real HTTP integration tests via supertest (auth, listing, create). 13 tests.
- [x] **OIDC hardening** — per-request **nonce binding** (verified against the
      `id_token` nonce claim), JWKS signature verification (RS/PS/ES family) with
      key-rotation re-fetch, iss/aud/exp/nbf validation, and **RP-initiated
      logout** (`end_session_endpoint`). 11 tests.
- [x] **SAML Single Logout (SLO)** — `getLogoutUrlAsync` SP-initiated logout;
      `consumeAssertion` now surfaces `nameID` + `sessionIndex`, returned from the
      ACS callback so the client can drive SLO. Falls back to local logout when
      the IdP advertises no SLO endpoint.
- [x] **Full VM driver matrix (11)** — beyond Proxmox: **AWS** EC2 (inline SigV4),
      **Azure** VM, **GCP** Compute, **vSphere**, **DigitalOcean**, **Oracle OCI**
      (request signing), **OpenStack** (Keystone v3), **Nutanix** (Prism Central
      v3), **KubeVirt** and **Harvester** (VirtualMachine CRDs over the K8s API).
      Every one of the 11 provider enum values resolves to a concrete driver. 29 tests.
- [x] **Secret-sealing at rest (AES-256-GCM)** — `config-seal` helper seals the
      whole provider-config blob into `secretRef`; `config` keeps a redacted copy
      so API responses never expose secrets. Applied to **VM/DNS providers,
      auth providers** (OIDC clientSecret, SAML idpCert, LDAP bindPassword) **and
      webhook HMAC keys**. Masked values on update mean "unchanged" so editing a
      form never overwrites a stored secret. 4 + integration tests.
- [x] **SSO mapping UI + admin Block A** — every nav placeholder replaced with a
      real backend-wired page (zones, servers, pools, autoscale, DNS providers,
      reporting, audit log, metrics, log forwarding, webhooks, API keys, API docs,
      staging, casting, storage mappings, connectivity, settings, branding,
      banners, config import/export, security/passkeys). Zero `phase:` stubs left.

**Phase 7 is complete.** 276 tests (+66), 26 typecheck+lint+build tasks all green.
New open-source deps: `@simplewebauthn/server` + `@simplewebauthn/browser`.
Nothing from Kasm.

---

## Bug hunt (continuous)

Tracked findings from running the full repo (`typecheck · lint · test · build`)
and reading the runtime paths.

### Fixed
- [x] **Agent subscribed to the wrong zone channel.** The agent listened on
      `provision/destroy(ASHA_ZONE)` (local env) while the manager publishes on
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
- [x] **Tenant isolation on update/delete-by-PK.** The Prisma tenant extension
      now scopes `findUnique`/`update`/`delete` by injecting `orgId` into the
      WHERE clause (`SCOPED_UNIQUE_OPS`). Postgres RLS SQL script added as a
      DB-level backstop (`packages/db/prisma/rls/tenant_isolation.sql`) —
      full enforcement requires connecting as a non-owner role with `SET LOCAL`
      inside every transaction (Phase 3+ deployment step).
- [x] **Refresh-token reuse / family replay detection.** Rotation now carries
      the `family` id forward across every refresh (was minting a fresh family
      each time, breaking the chain). Presenting an already-rotated (revoked)
      token is treated as a leak: the entire family is revoked in one sweep,
      an `auth.refresh_replay_detected` audit record is written, and the caller
      is forced to re-login. Forged, expired, and suspended-user paths reject
      without touching the family. 6 unit tests.
