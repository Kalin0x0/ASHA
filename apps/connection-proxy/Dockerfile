# ── Chista connection-proxy (WebSocket bridge for RDP/VNC/SSH) ───────────────
FROM node:22-slim AS builder
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* tsconfig.base.json ./
COPY packages/events ./packages/events
COPY packages/logger ./packages/logger
COPY packages/proxy-labels ./packages/proxy-labels
COPY apps/connection-proxy ./apps/connection-proxy
RUN pnpm install --no-frozen-lockfile
RUN pnpm --filter @chista/events --filter @chista/logger --filter @chista/proxy-labels build \
  && pnpm --filter @chista/connection-proxy build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app ./
CMD ["node", "apps/connection-proxy/dist/index.js"]
