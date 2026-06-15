# Findings: server / RDP workspace flow (bugs + deployment fixes)

Verified end-to-end against `main` (#34) with a Windows RDP host (NLA). The streaming engine works (proxy framing + canvas z-index fixes + Control Panel). The **working path** for RDP/Windows is **Admin → Infrastructure → Servers → [server] → "Connect"** → `/connect/[kasmId]` canvas viewer. The catalog "Launch" and session "Open viewer" paths are broken for RDP (bugs below).

## Open bugs

### 1. `auth` throttler (10/min) applies to ALL routes -> 429 flood
`apps/api/src/app.module.ts` defines two throttlers (`global` 600/min, `auth` 10/min). In NestJS every named throttler applies to every route unless `@SkipThrottle` excludes it; there is no skip on the non-auth controllers, so the **10/min auth cap gates every endpoint**. The dashboard polls `/agents` + `/sessions` -> continuous 429.
- Repro: the 11th request within 60s to any endpoint -> 429.
- Fix: scope `auth` to auth routes only (a `skipIf` on path, or `@SkipThrottle({ auth: true })` globally + `@Throttle({ auth })` on login).

### 2. `trust proxy = 1` is too low behind NPM -> Traefik (2 hops)
`apps/api/src/main.ts` defaults `trust proxy = 1`; the public chain is NPM -> Traefik = 2 hops, so `req.ip` collapses to the NPM IP (one shared bucket). Use `CHISTA_TRUST_PROXY=2`.

### 3. (FIXED in #28) Create-workspace form did not persist Server/VM type + serverId
Creating a "Server / VM" workspace saved `type=CONTAINER`, `serverId=NULL` (the web form did not send them; the API was already correct). Fixed in #28.

### 4. Server-session `connectionUrl` uses kasmId in the path and points to `/session` not `/connect`
`apps/api/src/modules/servers/servers.service.ts` builds `connectionUrl = <proxyBaseUrl>/session/<kasmId>/?token=`. The `/session/[param]` viewer treats `param` as the session id -> `GET /sessions/<kasmId>` -> 404 -> "Preparing" forever (kasmId != session id).
- Fix: put the session id in the path (and/or route to `/connect`).

### 5. `/session` portal viewer iframes itself -> X-Frame-Options "refused to connect"
"Open viewer" -> `/session/[sessionId]` embeds `<iframe src=".../session/[kasmId]?token=">` which (a) uses kasmId (404 per #4) and (b) is blocked by X-Frame-Options/CSP. The outer page shows "Connected" but the stream box is empty.
- Fix: render the `/connect` canvas (it derives the WS URL from `window.location`, so it works on any domain), or allow same-origin framing AND fix the inner URL.

## Deployment fixes applied
1. `docker-compose.override.yml` (in this PR) — `CHISTA_THROTTLE_AUTH_LIMIT=600` + `CHISTA_TRUST_PROXY=2` (works around #1/#2). NOTE: if merged, reconcile with any same-named untracked file on the live host before the next `git reset --hard`.
2. Zone (default) `proxyBaseUrl` was the seed default `https://chista.local` (internal, unreachable from public browsers); it overrides `CHISTA_PUBLIC_URL` in `servers.service.ts`. Set to the public domain via `PATCH /zones/:id`. The seed should default this to the deployment's public URL.
