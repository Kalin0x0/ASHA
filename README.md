<div align="center">

# Chista

**A modern container-streaming / VDI / DaaS platform.**
Stream containerized desktops, browsers, and apps to any browser — self-hosted, multi-tenant, and built to outclass the incumbents.

**A [Naiemi Group](#) product.**

`anthracite #1a1a2e` · `gold #d4af37`

</div>

---

> **What is this?** Chista is an original, ground-up platform by **Naiemi Group**, inspired by the
> feature set and architecture of commercial container-streaming products (Kasm Workspaces and the
> like). It is **not** a copy of any proprietary codebase — every line is our own implementation.
> Where genuinely open-source streaming/runtime components exist (KasmVNC, noVNC, Neko, Squid,
> WireGuard, guacd, Fluent Bit), Chista consumes them as **unmodified runtime container images or
> generated config**, never linked into our source, so licenses stay clean.

> **Status:** Phases 1–6 complete. **210 unit tests**, full `typecheck · lint · test · build`
> green across 25 workspace tasks. See [`TODO.md`](TODO.md) for the phase-by-phase build log.

## Architecture

```
                           ┌──────────────────────────────────────────────┐
   Browser  ──https──►     │  Traefik (edge + per-session dynamic routing) │
                           └──┬─────────┬─────────────┬──────────────┬─────┘
                              │         │             │              │
                   ┌──────────▼──┐ ┌────▼──────┐ ┌────▼───────┐ ┌────▼──────────────┐
                   │ web (Next)  │ │ api (Nest)│ │ connection │ │ session container │
                   │admin+portal │ │Manager/API│ │   proxy    │ │ KasmVNC | Neko    │
                   └─────────────┘ └──┬───┬────┘ │RDP/VNC/SSH  │ │ + sidecars:       │
                                      │   │      └──┬──────────┘ │ Squid/WireGuard   │
                              ┌───────▼┐ ┌▼──────┐  │ guacd/ssh2 └──────▲────────────┘
                              │postgres│ │ redis │◄─┘                   │ docker / k8s
                              └────────┘ └───┬───┘            ┌─────────┴───────────┐
                                             └────────────────│ agent (dockerode /  │
                                              provision/destroy│   @kubernetes)      │
                                                               └─────────────────────┘
```

| Workspace | Path | Purpose |
| --- | --- | --- |
| `@chista/web` | `apps/web` | Next.js 15 admin dashboard **and** end-user portal (the showpiece). |
| `@chista/api` | `apps/api` | NestJS Manager/API — REST + WebSocket control plane, OpenAPI at `/api/docs`. |
| `@chista/agent` | `apps/agent` | Node agent that provisions & destroys session containers — Docker (dockerode) **or** Kubernetes (ephemeral Pods) driver, plus connectivity sidecars + device passthrough. |
| `@chista/connection-proxy` | `apps/connection-proxy` | RDP/VNC bridge to **guacd**, and SSH bridge via **ssh2** (PTY, resize, key/password auth). |
| `@chista/db` | `packages/db` | Prisma schema (single source of truth), client, migrations, seed, RLS backstop. |
| `@chista/contracts` | `packages/contracts` | Shared DTOs / zod schemas / event contracts. |
| `@chista/rbac` | `packages/rbac` | Permission catalog + role matrix + policy evaluation. |
| `@chista/proxy-labels` | `packages/proxy-labels` | Pure fn: a session → Traefik labels / k8s ingress. |
| `@chista/events` | `packages/events` | Typed Redis pub/sub channels + provision/sidecar command shapes. |
| `@chista/config` · `@chista/crypto` · `@chista/logger` | `packages/*` | Env loading, secret/token crypto, structured logging. |

## Capabilities

Built from scratch or on open-source tooling — **nothing derived from any proprietary product**.

- **Streaming** — KasmVNC (HTTPS iframe) **and** WebRTC/H.264 via Neko as a first-class protocol.
- **GPU encoding** — hardware H.264 via NVENC (nvidia-container-runtime) or VAAPI (DRI render node), wired into both the Docker and Kubernetes drivers.
- **Remote protocols** — RDP/VNC through guacd, SSH through ssh2 (full PTY, resize, key/password auth).
- **Session control** — pause/resume (container freeze), live resize, and a multi-monitor resolution selector in the viewer.
- **Device passthrough** — webcam / USB / smartcard (`/dev/video0`, `/dev/bus/usb`, `/dev/pcsc`) into the session container (Docker `Devices`, Kubernetes `CharDevice` hostPath + capabilities).
- **Connectivity sidecars** — Squid (web filtering), WireGuard (egress), Neko (browser isolation), PulseAudio (audio bridge), CUPS (virtual printing), auto-launched alongside sessions and torn down with them.
- **DLP enforcement** — per-workspace clipboard/upload/download/printing/audio/PWA policy injected as container env and **enforced in the viewer** (controls greyed out by policy).
- **Multi-tenancy & RBAC** — 40+ Prisma models, permission matrix, app-layer org scoping + Postgres RLS backstop.
- **Identity** — OIDC / SAML / LDAP providers + SSO group mappings, TOTP 2FA. **SAML 2.0 SP-initiated flow** (login redirect, ACS, SP metadata) and **LDAP bind login + live-test**, with JIT user provisioning and group sync — all on open-source `@node-saml/node-saml` + `ldapts`.
- **Licensing** — CONCURRENT and NAMED_USER enforcement gating session launch, with a live utilization page.
- **Marketplace** — image-registry CRUD + catalog sync + one-click workspace install from an open-format registry index.
- **Scale** — multi-zone, staging pools, casting, server pools + autoscale, VM/DNS providers (real Proxmox VE driver).
- **Sessions** — sharing + live chat, recording to S3, idle/max-duration reaper, forensic watermarking + compliance banner.
- **Ops & compliance** — SIEM log forwarding (Fluent Bit: syslog/Splunk/ES/Loki/HTTP), automated `pg_dump` backups with retention, webhooks (HMAC-signed) + reporting.
- **Deploy** — single-node Docker Compose (Traefik, Postgres, Redis, guacd) and a Helm chart with the Kubernetes agent DaemonSet, session namespace, RBAC, and HPA.

## Quick start

### Option A — the UI showpiece only (no Docker, fastest)

The web app runs fully on deterministic mock data (`NEXT_PUBLIC_API_MODE=mock`).

```bash
pnpm install
cp .env.example .env
pnpm --filter @chista/web dev
# open http://localhost:3000  → login with any credentials (mock mode)
```

### Option B — the full stack (Docker)

```bash
cp .env.example .env
docker compose up -d --build
# web:     https://chista.local        (add `127.0.0.1 chista.local` to your hosts file)
# api docs: https://chista.local/api/docs
```

The `db-migrate` one-shot container runs `prisma migrate deploy` + seed automatically.
Default admin credentials are printed by the seed (see `packages/db/prisma/seed.ts`).

### Local dev against a real API

```bash
pnpm install
docker compose up -d postgres redis traefik   # infra only
pnpm db:migrate && pnpm db:seed
pnpm dev                                        # turbo runs web + api + agent
# set NEXT_PUBLIC_API_MODE=live in .env to call the real API
```

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Run web + api + agent in watch mode (Turbo). |
| `pnpm dev:web` | Just the Next.js app (mock mode → no backend needed). |
| `pnpm build` | Build every workspace. |
| `pnpm typecheck` | Type-check every workspace. |
| `pnpm db:migrate` / `db:seed` / `db:studio` | Prisma lifecycle. |
| `pnpm test` | Unit + e2e tests. |

## Roadmap

All six phases are complete. The full per-item build log lives in [`TODO.md`](TODO.md).

- ✅ **Phase 1** — monorepo, full data model, the Chista design system, admin shell + live dashboard + sessions, the end-user **launch → stream** flow against a real KasmVNC container, single-node Docker Compose, Helm skeleton.
- ✅ **Phase 2** — RDP/VNC via guacd + SSH via ssh2, session sharing & chat, recording (S3), persistent profiles & file mappings, TOTP 2FA.
- ✅ **Phase 3** — full OIDC/SAML/LDAP, multi-zone + staging + casting, server pools + autoscale + VM/DNS providers (real Proxmox VE driver), security hardening, reporting/webhooks.
- ✅ **Phase 4** — storage mappings, browser isolation / web filtering / egress, Kubernetes driver + HPA, Windows/RDS.
- ✅ **Phase 5** — session reaper, forensic watermarking, SIEM log forwarding, automated backups, DLP, WebRTC/H.264 (Neko), device passthrough, connectivity sidecars wired into provisioning.
- ✅ **Phase 6** — closing the gaps to the incumbents: session pause/resume/resize + multi-monitor, GPU encoding (NVENC/VAAPI), runtime DLP enforcement (agent + viewer), PulseAudio + CUPS sidecars, full SAML SP-initiated flow + LDAP bind/live-test with JIT provisioning, license enforcement, image-registry marketplace, drag-and-drop upload, and mobile/touch-optimized viewer.

## License & ownership

Chista is a **Naiemi Group** product. All first-party source in this repository is owned by
Naiemi Group. Third-party open-source runtime images and tools (KasmVNC, Neko, Squid, WireGuard,
guacd, Fluent Bit, Traefik, Postgres, Redis) are used **unmodified** under their respective
licenses and are never linked into Chista's source.

<div align="center">

— built by **Naiemi Group** —

</div>
