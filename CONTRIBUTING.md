# Contributing to Asha

Thanks for your interest in improving Asha! This guide gets you from a fresh
clone to a green test run and a clean pull request.

By participating you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).

## Prerequisites

- **Node.js ≥ 20** (the Docker images build on Node 22).
- **pnpm 9.15.9** — this repo pins its package manager; the easiest way is
  `corepack enable && corepack prepare pnpm@9.15.9 --activate`.
- **Docker** (+ Compose) — for Postgres, Redis, and running the full stack.

## Getting started

```bash
git clone https://github.com/Kalin0x0/ASHA.git
cd ASHA
pnpm install

# Configure the environment (generate real secrets for anything non-local)
cp .env.example .env

# Bring up the datastores + sync the schema
docker compose up -d postgres redis
pnpm --filter @asha/db run db:generate
pnpm --filter @asha/db run db:migrate      # or `db push` for a Phase-1 sync
pnpm --filter @asha/db run db:seed         # seeds an admin + demo data
```

### Run it

```bash
pnpm dev            # everything via Turborepo
# or target one app:
pnpm dev:web        # Next.js frontend
pnpm dev:api        # NestJS backend
pnpm dev:agent      # the workspace agent
```

The full containerized stack (api, web, agent, connection-proxy, traefik, guacd)
is `docker compose up -d`.

## Quality gates

Everything below must pass before a PR is merged — CI runs the same checks:

```bash
pnpm typecheck      # tsc across the workspace
pnpm lint           # eslint / next lint
pnpm test           # vitest (currently 510 tests)
pnpm build          # turbo build
```

Run `pnpm format` to apply Prettier.

## Repository layout

A pnpm + Turborepo monorepo:

```
apps/
  api/                NestJS API (auth, RBAC, sessions, billing, …)
  web/                Next.js 15 / React 19 frontend (Tailwind v4, shadcn)
  agent/              runs on each host; provisions & streams containers
  connection-proxy/   brokers RDP/VNC/SSH via guacd
packages/
  db/                 Prisma schema, client, seed
  contracts/          shared Zod DTOs
  rbac/ crypto/ config/ events/ logger/ proxy-labels/
```

## Making changes

1. **Branch** off `main`: `git checkout -b feat/short-description`.
2. Keep changes focused; match the surrounding code's style and conventions.
3. Add or update **tests** for behavior changes (`*.test.ts` next to the code).
4. Run the quality gates above.
5. Use **[Conventional Commits](https://www.conventionalcommits.org/)** for
   messages, e.g. `feat(sessions): …`, `fix(viewer): …`, `docs(readme): …`.
6. Open a PR against `main` with a clear description of the what and why. Link
   any related issue. CI must be green.

## Reporting bugs & requesting features

- **Bugs / features** → open a [GitHub issue](https://github.com/Kalin0x0/ASHA/issues).
- **Security vulnerabilities** → **do not** open a public issue; follow
  [SECURITY.md](SECURITY.md).

Happy hacking! 🛡️
