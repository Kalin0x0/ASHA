# Findings: server / RDP workspace flow (bugs + deployment fixes)

Verified end-to-end against `main` (#34) with a Windows RDP host (NLA). The streaming engine works (proxy framing + canvas z-index fixes + Control Panel). The **working path** for RDP/Windows is **Admin → Infrastructure → Servers → [server] → "Connect"** → `/connect/[kasmId]` canvas viewer. The catalog "Launch" and session "Open viewer" paths were broken for RDP (bugs below).

## Open bugs

### 1. `auth` throttler (10/min) applies to ALL routes -> 429 flood — ✅ FIXED
`apps/api/src/app.module.ts` defined two throttlers (`global` 600/min, `auth` 10/min). In NestJS every named throttler applies to every route unless `@SkipThrottle` excludes it; there was no skip on the non-auth controllers, so the **10/min auth cap gated every endpoint**. The dashboard polls `/agents` + `/sessions` -> continuous 429.
- Repro: the 11th request within 60s to any endpoint -> 429.
- **Fix (applied):** collapsed to a single `default` throttler (600/min) applied to all routes, and tightened the auth/federation/webauthn routes with a per-route `@Throttle({ default: … })` override. Login brute-force protection (10/min, env-tunable via `CHISTA_THROTTLE_AUTH_LIMIT`) is preserved; the rest of the API is no longer capped at the auth limit.

### 2. `trust proxy = 1` is too low behind NPM -> Traefik (2 hops)
`apps/api/src/main.ts` defaults `trust proxy = 1`; the public chain is NPM -> Traefik = 2 hops, so `req.ip` collapses to the NPM IP (one shared bucket). Set `CHISTA_TRUST_PROXY=2` for that topology (the value is already env-configurable — no code change needed; it's a per-deployment knob).

### 3. (FIXED in #28) Create-workspace form did not persist Server/VM type + serverId
Creating a "Server / VM" workspace saved `type=CONTAINER`, `serverId=NULL` (the web form did not send them; the API was already correct). Fixed in #28.

### 4. Server-session `connectionUrl` points at the proxy `/session/<kasmId>` path — ✅ WORKED AROUND
`apps/api/src/modules/servers/servers.service.ts` builds `connectionUrl = <proxyBaseUrl>/session/<kasmId>/?token=`. When `proxyBaseUrl` is the same origin as the web app, `/session/<kasmId>` collides with the Next.js `/session/[sessionId]` route (kasmId != session id) -> "Preparing" forever.
- **Fix (applied):** the `/session/[sessionId]` viewer now detects remote-desktop sessions (RDP/VNC/SSH) and redirects to the `/connect/[kasmId]` canvas, which derives its WS URL from the page origin — so the stored `connectionUrl` is bypassed for these sessions. (A deeper cleanup of the stored value remains optional.)

### 5. `/session` portal viewer iframes itself -> X-Frame-Options "refused to connect" — ✅ FIXED
"Open viewer" -> `/session/[sessionId]` embedded `<iframe src=".../session/[kasmId]?token=">` which (a) used kasmId (per #4) and (b) was blocked by X-Frame-Options/CSP. The outer page showed "Connected" but the stream box was empty.
- **Fix (applied):** remote-desktop sessions now render the `/connect` canvas (redirected from `/session/[sessionId]`); the broken iframe is no longer mounted. This matches the existing routing in the launch dialog (#32) and the "My Sessions" resume strip (#29).

## Deployment notes
1. ~~`docker-compose.override.yml` stopgap~~ — no longer needed now that #1 is fixed at the root; keep any throttle/trust-proxy overrides as **host-local** env (`docker-compose.override.yml` is conventionally untracked) rather than committed to the repo, so they don't weaken defaults for every deployment.
2. Zone (default) `proxyBaseUrl` was the seed default `https://chista.local` (internal, unreachable from public browsers); it overrides `CHISTA_PUBLIC_URL` in `servers.service.ts`. Set it to the public domain via `PATCH /zones/:id`. The seed should default this to the deployment's public URL.
