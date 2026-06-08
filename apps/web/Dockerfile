# ── Chista web (Next.js admin + portal) ─────────────────────────────────────
FROM node:22-slim AS builder
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
# openssl + ca-certificates are needed for `prisma generate` when the workspace
# packages (notably @chista/db) are built during the web image build.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_WS_URL
ARG NEXT_PUBLIC_API_MODE=mock
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL \
    NEXT_PUBLIC_API_MODE=$NEXT_PUBLIC_API_MODE \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_OPTIONS=--max-old-space-size=3072
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* tsconfig.base.json ./
# The web app imports the workspace packages (@chista/rbac, @chista/contracts, …)
# as `workspace:*` deps, so they must be present (and built) for pnpm to resolve
# them and for `next build` to compile. Without this the build fails with
# ERR_PNPM_WORKSPACE_PKG_NOT_FOUND.
COPY packages ./packages
COPY apps/web ./apps/web
RUN pnpm install --no-frozen-lockfile
RUN pnpm --filter @chista/db run db:generate \
  && pnpm --filter "./packages/*" --workspace-concurrency=1 build \
  && pnpm --filter @chista/web build

FROM node:22-slim AS runner
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /app ./
EXPOSE 3000
CMD ["pnpm", "--filter", "@chista/web", "start"]
