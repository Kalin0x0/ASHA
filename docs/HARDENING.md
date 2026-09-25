# Security hardening — review branch, not a production certification

Base: `d9fc421ad2e6e5d53fc0871d61f5974cc30b81ee` (2026-09-16).

## Changes in this branch

- Password login rejects ambiguous identities instead of selecting the first
  tenant. An optional organization slug scopes lookup; the login form exposes it.
- The login form now accepts an authenticator code, which the backend already
  required for accounts with TOTP enabled.
- New TOTP secrets are encrypted with the configured seal key. Legacy plaintext
  secrets remain readable; re-enroll them to migrate. Corrupted sealed values
  fail closed. Disabling TOTP requires a valid existing authenticator code.
- Global maintenance and full-database backups require a currently active
  system administrator, checked in the database, not only a stale JWT claim.
  Existing scheduled maintenance created by a non-system-admin, disabled or
  deleted account is disabled on its next execution attempt.
- Unclaimed proxy sessions no longer grant input to arbitrary tenant users.
- Webhook list responses redact secrets, including legacy plaintext values.
- Environment booleans parse `false`/`0` correctly and reject unknown values.
- Refresh requests now have a timeout, like ordinary API requests.
- API runtime includes PostgreSQL 17 client tools for the bundled PostgreSQL 16
  server. Backups persist in a Compose volume; configuration is passed through.
  Prisma-only connection options are stripped from the pg_dump connection URI,
  and the password is passed through PGPASSWORD rather than argv.
- Compose requires an explicitly configured initial admin password and defaults
  its web build to live mode when no override is supplied. The example .env still
  selects mock mode for UI development; full deployments must set live.
- Helm passes all required signing/sealing/enrollment keys; two missing secrets
  now fail at template rendering. This does NOT make the chart turnkey.
- Internal custom CA trust requires an explicit image-build opt-in.
- Installer/update failures no longer print a misleading success message after
  failed health checks or failed source updates.

## Operational changes to review before merging

1. Configure ASHA_SEED_ADMIN_PASSWORD even on existing Compose installations.
   The idempotent seed does not reset an existing account password.
2. Configure Helm `secrets.sealKey` and `secrets.guacCrypt` and replace all other
   shipped development secrets. Preserve the existing seal key on upgrades.
3. Tenant administrators lose global maintenance/backup access intentionally.
4. Rebuild API/web/proxy images together. An old client cannot disable TOTP
   without sending a code. Test ordinary and staged launches through real Traefik.
5. Preserve the backup volume and the seal key separately. Local dumps are not
   an off-site backup strategy. Perform a restore drill before production use.
6. Custom CA images require reviewed certs and `INSTALL_CUSTOM_CAS=1`.

## Verification (2026-09-22)

- Node 24.19.0, pinned pnpm 9.15.9; lockfile unchanged.
- Vitest: 105 files, 1,102 tests passed, zero failures (JSON reporter).
- `turbo run typecheck --concurrency=4`: all 25 tasks passed, including
  production builds of the web app, API, agent, proxy and shared packages.
- `pnpm lint`: passed; three existing root ESLint warnings and 15 existing
  Next.js React-hook warnings remain. No lint errors.
- Locale parity: 2,323 keys each in English, German and Persian.
- Shell syntax checks on both modified scripts and `git diff --check`: passed.
- Docker and Helm executables were unavailable. Container builds, Helm
  rendering/install, real database restore and browser/stream E2E were not run.
  GitHub CI runs on Node 20; its result must be reviewed separately.
- Optional native SSH acceleration failed to compile in this environment;
  dependency installation succeeded with its JavaScript fallback.

Use the matching PostgreSQL 17 restore client when inspecting these custom
archives, and validate restoration against the intended target server version.

## Second round (2026-09-25)

Re-verified against the tree as it stands, not against the notes above. Seven of
the eight claims in "Changes in this branch" still hold; none of the four commits
merged after PR #84 touched `apps/api`, `packages` or `apps/connection-proxy` at
all. The password-login ambiguity fix is the incomplete one: login now refuses to
guess between two matching rows, but `users.service.update` and the SCIM writers
still check a new username only against the `username` column, so a USER_EDIT
holder can manufacture the collision inside one organization and lock an account
out permanently. That is listed below rather than fixed here.

Fixed in this round:

- Refresh rotation and TOTP consumption are atomic. Both guards read a row,
  decided, and wrote the decision back, and the guarantee lived in the gap. The
  precondition now travels inside the UPDATE. Refresh additionally distinguishes a
  two-tab race from a replay: a live sibling token younger than ten seconds is
  served and recorded as `auth.refresh_race_graced`, everything else still burns
  the family. Step-up previously recorded no use at all, so a code observed once
  could elevate repeatedly for the rest of its window.
- The audio stream URL no longer carries a full API bearer. The route was already
  authorised by the session cookie and never read the parameter.
- `PGPASSWORD` is no longer forced to the empty string when `DATABASE_URL` carries
  no password, which previously overrode `.pgpass` and the ambient environment.

## Still open — not claimed fixed

- Browser refresh/access-token storage: migrate localStorage credentials to an
  HttpOnly refresh-cookie design with CSRF controls and multi-tab rotation tests.
  Do it in one change — the cookie, CSRF, the SSO callback and logout revocation
  are one migration, and `session-auth.controller` already demonstrates the cookie
  pattern this would follow.
- Access tokens in stream URLs: the audio case is fixed, `/connect` is not. There
  the token is load-bearing, so it needs purpose-bound short-lived tickets across
  proxy, reconnect, observer and ownership flows, deployed web-before-proxy. Session
  cookies also need revocation/lifecycle tests, not just JWT signature checks.
- Within-tenant username collisions: `users.service.update` and the SCIM write
  paths check only the `username` column where `create` checks both, so the
  fail-closed login check can be turned into a permanent account lockout.
- Complete multi-tenant identity design for passkeys, federation and public
  account discovery; the password lookup fix is not a full identity redesign.
- Tenant scoping on bulk/upsert/nested/raw operations and optional-org models;
  real PostgreSQL cross-tenant integration tests; RLS remains inactive.
- SSRF protection for operator-configured registry/webhook/provider endpoints:
  define intentional private-network access, then enforce DNS/IP/redirect rules
  and response-size limits. Do not blindly block legitimate internal services.
- Durable queues/reconciliation, distributed scheduler locks and shared SSO/
  WebAuthn challenges before enabling API replicas or HPA.
- Docker/Traefik/guacd E2E, migration/restore drills, Helm install tests,
  dependency/container scanning and real provider smoke tests. The web interface
  itself has now been exercised in a real browser, but only against MSW mock data:
  no API, no proxy, no guacd, no container.
- Protected branches, reviewed CI requirements, signed releases and immutable
  installer/update artifacts. Repository settings and deployments were untouched.
- DLP guarantees and README maturity claims require validation against actual
  workspace images; viewer controls alone are not a security boundary.

The prior numerical readiness scores were subjective, not measurements. An
empty legacy commit-status response or PR-only workflow query is not proof
that no push-triggered GitHub Actions run exists. No leaked CA private key was
found: the trust-policy issue concerned a public certificate.
