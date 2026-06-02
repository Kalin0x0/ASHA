<div align="center">

# Chista

**A modern container-streaming / VDI / DaaS platform.**
Stream containerized desktops, browsers, and apps to any browser — self-hosted, multi-tenant, and built to outclass the incumbents.

`anthracite #1a1a2e` · `gold #d4af37`

</div>

---

> **What is this?** Chista is an original, ground-up platform inspired by the feature set and
> architecture of commercial container-streaming products (Kasm Workspaces and the like). It is
> **not** a copy of any proprietary codebase — it is our own implementation. Where genuinely
> open-source streaming components exist (KasmVNC, noVNC, guacamole-lite), Chista consumes them as
> **unmodified runtime container images**, never linked into our source, so licenses stay clean.

## Architecture

```
                           ┌──────────────────────────────────────────────┐
   Browser  ──https──►     │  Traefik (edge + per-session dynamic routing) │
                           └───────┬───────────────┬───────────────┬──────┘
                                   │               │               │
                          ┌────────▼──────┐ ┌──────▼──────┐ ┌──────▼─────────────┐
                          │ web (Next.js) │ │ api (Nest)  │ │ session containers │
                          │ admin + portal│ │ Manager/API │ │ (KasmVNC images)   │
                          └───────────────┘ └──┬───┬──────┘ └──────▲─────────────┘
                                                │   │               │ docker run
                                       ┌────────▼┐ ┌▼────────┐ ┌────┴──────────────┐
                                       │ postgres│ │  redis  │ │ agent (dockerode) │
                                       └─────────┘ └─────────┘ └───────────────────┘
```

| Workspace | Path | Purpose |
| --- | --- | --- |
| `@chista/web` | `apps/web` | Next.js 15 admin dashboard **and** end-user portal (the showpiece). |
| `@chista/api` | `apps/api` | NestJS Manager/API — REST + WebSocket control plane, OpenAPI at `/api/docs`. |
| `@chista/agent` | `apps/agent` | Node + dockerode agent that provisions & destroys session containers. |
| `@chista/connection-proxy` | `apps/connection-proxy` | guacamole-lite bridge for RDP/VNC/SSH (Phase 2). |
| `@chista/db` | `packages/db` | Prisma schema (single source of truth), client, migrations, seed. |
| `@chista/contracts` | `packages/contracts` | Shared DTOs / zod schemas / event contracts. |
| `@chista/rbac` | `packages/rbac` | Permission catalog + role matrix + policy evaluation. |
| `@chista/proxy-labels` | `packages/proxy-labels` | Pure fn: a session → Traefik labels / k8s ingress. |
| `@chista/events` | `packages/events` | Typed Redis pub/sub channel definitions. |
| `@chista/config` · `@chista/crypto` · `@chista/logger` | `packages/*` | Env loading, secret/token crypto, structured logging. |

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

- **Phase 1 (this milestone)** — monorepo, full data model, the Chista design system, admin shell + live dashboard + sessions, the end-user **launch → stream** flow against a real KasmVNC container, single-node Docker Compose, Helm skeleton.
- **Phase 2** — RDP/VNC/SSH via guacamole-lite, session sharing & chat, recording (S3), persistent profiles & file mappings, 2FA/CAPTCHA.
- **Phase 3** — full OIDC/SAML/LDAP, multi-zone + staging + casting, server pools + autoscale + VM/DNS providers (Proxmox first), security hardening, reporting/webhooks.
- **Phase 4** — storage mappings, browser isolation / web filtering / egress, Kubernetes driver + HPA, Windows/RDS.

See [`docs/architecture`](docs/architecture) for details.
