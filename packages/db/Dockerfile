# ── Asha db-migrate (one-shot: sync schema + seed) ────────────────────────
FROM node:22-slim
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* tsconfig.base.json ./
COPY packages/db ./packages/db
RUN pnpm install --no-frozen-lockfile
RUN pnpm --filter @asha/db run db:generate
# `db push` syncs the schema without migration history (Phase 1); seed is idempotent.
CMD ["sh", "-c", "pnpm --filter @asha/db exec prisma db push --skip-generate --accept-data-loss && pnpm --filter @asha/db run seed"]
