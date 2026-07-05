<div align="center">

<img src="apps/web/public/asha-logo.svg" alt="ASHA" width="168" height="168" />

# Asha

**A modern container-streaming / VDI / DaaS platform.**
Stream containerized desktops, browsers, and apps to any browser — self-hosted, multi-tenant, and built to outclass the incumbents.

**A [Naiemi Group](#) product.**

`anthracite #1a1a2e` · `gold #d4af37`

</div>

---

> **What is this?** Asha is an original, ground-up platform by **Naiemi Group**, inspired by the
> feature set and architecture of commercial container-streaming products (Kasm Workspaces and the
> like). It is **not** a copy of any proprietary codebase — every line is our own implementation.
> Where genuinely open-source streaming/runtime components exist (KasmVNC, noVNC, Neko, Squid,
> WireGuard, guacd, Fluent Bit), Asha consumes them as **unmodified runtime container images or
> generated config**, never linked into our source, so licenses stay clean.

> **Status:** Phases 1–7 complete. **276 unit tests**, full `typecheck · lint · test · build`
> green across 26 workspace tasks. Identity (WebAuthn passkeys, SCIM 2.0, OIDC nonce-binding +
> RP-logout, SAML SLO), an 11-provider VM driver matrix (Proxmox, AWS, Azure, GCP, vSphere,
> DigitalOcean, Oracle OCI, OpenStack, Nutanix, KubeVirt, Harvester) and AES-256-GCM
> secret-sealing at rest now exceed Kasm's open tier. See [`TODO.md`](TODO.md) for the
> phase-by-phase build log.

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
| `@asha/web` | `apps/web` | Next.js 15 admin dashboard **and** end-user portal (the showpiece). |
| `@asha/api` | `apps/api` | NestJS Manager/API — REST + WebSocket control plane, OpenAPI at `/api/docs`. |
| `@asha/agent` | `apps/agent` | Node agent that provisions & destroys session containers — Docker (dockerode) **or** Kubernetes (ephemeral Pods) driver, plus connectivity sidecars + device passthrough. |
| `@asha/connection-proxy` | `apps/connection-proxy` | RDP/VNC bridge to **guacd**, and SSH bridge via **ssh2** (PTY, resize, key/password auth). |
| `@asha/db` | `packages/db` | Prisma schema (single source of truth), client, migrations, seed, RLS backstop. |
| `@asha/contracts` | `packages/contracts` | Shared DTOs / zod schemas / event contracts. |
| `@asha/rbac` | `packages/rbac` | Permission catalog + role matrix + policy evaluation. |
| `@asha/proxy-labels` | `packages/proxy-labels` | Pure fn: a session → Traefik labels / k8s ingress. |
| `@asha/events` | `packages/events` | Typed Redis pub/sub channels + provision/sidecar command shapes. |
| `@asha/config` · `@asha/crypto` · `@asha/logger` | `packages/*` | Env loading, secret/token crypto, structured logging. |

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
- **Identity** — OIDC / SAML / LDAP providers + SSO group mappings, TOTP 2FA. **OIDC Authorization Code + PKCE flow** with **JWKS ID-token signature verification** (RS/PS/ES256-512, iss/aud/exp validation), **SAML 2.0 SP-initiated flow** (login redirect, ACS, SP metadata), and **LDAP bind login + live-test**, with JIT user provisioning and IdP-attribute→group mapping — on open-source `@node-saml/node-saml` + `ldapts` plus a zero-dependency OIDC client. The login screen renders live SSO buttons, and the Authentication admin page manages providers, SSO group mappings, and SCIM tokens.
- **Passkeys / WebAuthn** — passwordless, phishing-resistant sign-in on open-source `@simplewebauthn/server`: passkey enrollment (Settings → Security) and a passkey login button on the sign-in screen, with signature-counter clone detection.
- **SCIM 2.0** — automated user + group provisioning/deprovisioning (RFC 7643/7644) for Okta, Azure AD, OneLogin: Users + Groups CRUD, PATCH ops, SCIM filters, bearer-token auth, and ServiceProviderConfig/ResourceTypes discovery.
- **Licensing** — CONCURRENT and NAMED_USER enforcement gating session launch, with a live utilization page.
- **Marketplace** — image-registry CRUD + catalog sync + one-click workspace install from an open-format registry index.
- **Scale** — multi-zone, staging pools, casting, server pools + autoscale, DNS providers, and real VM-provider drivers for **all eleven** backends: Proxmox VE, AWS EC2 (inline SigV4), Azure, GCP, VMware vSphere, DigitalOcean, Oracle OCI (request signing), OpenStack (Keystone v3), Nutanix AHV (Prism Central v3), and KubeVirt / Harvester (VirtualMachine CRDs over the Kubernetes API).
- **Sessions** — sharing + live chat, recording to S3, idle/max-duration reaper, forensic watermarking + compliance banner.
- **Ops & compliance** — SIEM log forwarding (Fluent Bit: syslog/Splunk/ES/Loki/HTTP), automated `pg_dump` backups with retention, webhooks (HMAC-signed) + reporting.
- **Deploy** — single-node Docker Compose (Traefik, Postgres, Redis, guacd) and a Helm chart with the Kubernetes agent DaemonSet, session namespace, RBAC, and HPA.

## Quick start

### One command on Ubuntu (recommended) — the branded installer

Take a bare Ubuntu/Debian box to a **live, signed-in-ready** Asha in one line.
The installer greets you with the Asha mark, then handles Docker, strong secrets,
your **domain + TLS**, the full stack, and the database migrate + seed:

```bash
curl -fsSL https://raw.githubusercontent.com/Kalin0x0/Asha/main/scripts/install.sh | sudo bash
```

<details>
<summary>What you'll see</summary>

```
==============================================================================

                            ######  ######
                        ####      ##      ####
                      ###    ##########    ###
                     ##    ####      ####    ##
                    ##    ##    ####    ##    ##
                    ##    ##   ##  ##   ##    ##
                    ##    ##    ####    ##    ##
                     ##    ####      ####    ##
                      ###    ##########    ###
                        ####      ##      ####
                            ######  ######

         _    ____  _   _    _
        / \  / ___|| | | |  / \
       / _ \ \___ \| |_| | / _ \
      / ___ \ ___) |  _  |/ ___ \
     /_/   \_\____/|_| |_/_/   \_\

              C O N T A I N E R   S T R E A M I N G

==============================================================================

  Naiemi Group  ·  VDI / DaaS Platform                       Installer  v1.0.0
```
</details>

From a clone, or non-interactively:

```bash
sudo bash scripts/install.sh                                   # interactive menu
sudo bash scripts/install.sh --domain asha.example.com \
     --email ops@example.com --yes                             # unattended
```

The installer is also your control panel: `status` · `logs` · `restart` ·
`update` · `uninstall`. **Full guide → [`docs/INSTALL.md`](docs/INSTALL.md).**

### Option A — the UI showpiece only (no Docker, fastest)

The web app runs fully on deterministic mock data (`NEXT_PUBLIC_API_MODE=mock`).

```bash
pnpm install
cp .env.example .env
pnpm --filter @asha/web dev
# open http://localhost:3000  → login with any credentials (mock mode)
```

### Option B — the full stack (Docker)

```bash
cp .env.example .env
docker compose up -d --build
# web:     https://asha.local        (add `127.0.0.1 asha.local` to your hosts file)
# api docs: https://asha.local/api/docs
```

The `db-migrate` one-shot container syncs the schema with `prisma db push`
(Phase 1 — no migration history; runs with `--accept-data-loss`) and runs the
idempotent seed automatically.
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

All seven phases are complete. The full per-item build log lives in [`TODO.md`](TODO.md).

- ✅ **Phase 1** — monorepo, full data model, the Asha design system, admin shell + live dashboard + sessions, the end-user **launch → stream** flow against a real KasmVNC container, single-node Docker Compose, Helm skeleton.
- ✅ **Phase 2** — RDP/VNC via guacd + SSH via ssh2, session sharing & chat, recording (S3), persistent profiles & file mappings, TOTP 2FA.
- ✅ **Phase 3** — full OIDC/SAML/LDAP, multi-zone + staging + casting, server pools + autoscale + VM/DNS providers (real Proxmox VE driver), security hardening, reporting/webhooks.
- ✅ **Phase 4** — storage mappings, browser isolation / web filtering / egress, Kubernetes driver + HPA, Windows/RDS.
- ✅ **Phase 5** — session reaper, forensic watermarking, SIEM log forwarding, automated backups, DLP, WebRTC/H.264 (Neko), device passthrough, connectivity sidecars wired into provisioning.
- ✅ **Phase 6** — closing the gaps to the incumbents: session pause/resume/resize + multi-monitor, GPU encoding (NVENC/VAAPI), runtime DLP enforcement (agent + viewer), PulseAudio + CUPS sidecars, full SAML SP-initiated flow + LDAP bind/live-test with JIT provisioning, license enforcement, image-registry marketplace, drag-and-drop upload, and mobile/touch-optimized viewer.
- ✅ **Phase 7** — enterprise identity, the full VM driver matrix, and at-rest secret hardening: **WebAuthn / passkeys** (passwordless login + enrollment), **SCIM 2.0** user/group provisioning, **OIDC** Authorization Code + PKCE with JWKS ID-token verification, **nonce-binding** and **RP-initiated logout**, **SAML Single Logout** (nameID + sessionIndex), eleven real VM-provider drivers (Proxmox/AWS/Azure/GCP/vSphere/DigitalOcean/Oracle/OpenStack/Nutanix/KubeVirt/Harvester), **AES-256-GCM secret-sealing at rest** for every provider, auth-config and webhook secret, and a **complete admin surface** — every navigation item is now a live page wired to its backend: Authentication (providers + SSO mappings + SCIM), Infrastructure (Zones/Servers/Pools/AutoScale/VM+DNS providers), Sessions (Staging/Casting), Storage Mappings, Connectivity (Proxies/Web Filtering/Browser Isolation/Egress), Observability (Reporting/Metrics/Audit Log/Log Forwarding), Developer (API Keys/Webhooks/API Docs), and Settings (General/Branding/Banners/Database/Config Import-Export/Security).

## 💛 Support this project

<div align="center">

[![Sponsor Asha](https://img.shields.io/badge/Sponsor-%E2%9D%A4-db61a2?style=for-the-badge&logo=githubsponsors&logoColor=white)](https://github.com/sponsors/Kalin0x0)
[![GitHub Sponsors](https://img.shields.io/github/sponsors/Kalin0x0?style=for-the-badge&logo=githubsponsors&logoColor=white&label=Sponsors&color=db61a2)](https://github.com/sponsors/Kalin0x0)
[![License](https://img.shields.io/badge/License-MIT-d4af37?style=for-the-badge)](LICENSE)

</div>

Asha is built in the open by **[Naiemi Group](https://github.com/Kalin0x0)** — an
original, from-scratch container-streaming / VDI / DaaS platform. If Asha saves you
time, powers your workspaces, or you'd simply like to see it grow, **your support keeps
the containers streaming** ✨. Every sponsorship goes straight into development, hosting
for the demo, and the next batch of features. Thank you 🙏

### ❤️ Become a sponsor

The best way to support Asha is **GitHub Sponsors** — one-off or monthly, cancel anytime:

<div align="center">

### **[→ Sponsor Asha on GitHub](https://github.com/sponsors/Kalin0x0)**

</div>

### ☕ Other ways to donate

Prefer buying us a coffee? Every cup fuels a late-night feature 💛

<div align="center">

[![Ko-fi](https://img.shields.io/badge/Ko--fi-Buy%20me%20a%20coffee-ff5e5b?style=for-the-badge&logo=ko-fi&logoColor=white)](https://ko-fi.com/kalin0x)

</div>

More platforms activate automatically from [`.github/FUNDING.yml`](.github/FUNDING.yml) —
add your handles there to light up the badges below (see the
[Sponsoring guide](docs/SPONSORING.md)).

<!--
  Ready-to-use external donation badges. Uncomment a line and replace the handle
  once the matching entry is set in .github/FUNDING.yml. (No placeholder links are
  shown until then, so the section never renders a broken button.)

[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-Support-ffdd00?style=for-the-badge&logo=buymeacoffee&logoColor=black)](https://www.buymeacoffee.com/YOUR_BMAC_USERNAME)
[![Patreon](https://img.shields.io/badge/Patreon-Become%20a%20patron-f96854?style=for-the-badge&logo=patreon&logoColor=white)](https://www.patreon.com/YOUR_PATREON_USERNAME)
[![Open Collective](https://img.shields.io/badge/Open%20Collective-Contribute-1f87ff?style=for-the-badge&logo=opencollective&logoColor=white)](https://opencollective.com/YOUR_COLLECTIVE_SLUG)
[![PayPal](https://img.shields.io/badge/PayPal-Donate-00457c?style=for-the-badge&logo=paypal&logoColor=white)](https://www.paypal.me/YOUR_PAYPAL_HANDLE)
-->

> ⭐ Not able to donate? **Starring the repo** and sharing Asha helps just as much — it's
> free and it genuinely moves the needle. New here? The
> [installation guide](docs/INSTALL.md) gets you a live Asha in one command.

## License & ownership

Asha is a **Naiemi Group** product. All first-party source in this repository is owned by
Naiemi Group. Third-party open-source runtime images and tools (KasmVNC, Neko, Squid, WireGuard,
guacd, Fluent Bit, Traefik, Postgres, Redis) are used **unmodified** under their respective
licenses and are never linked into Asha's source.

<div align="center">

— built by **Naiemi Group** —

</div>
