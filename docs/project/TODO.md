# Chista — TODO / Open Work

> **Authoritative roadmap lives in the repo-root [`TODO.md`](../../TODO.md).**
> This file is the historical Phase-1→7 backlog, kept for context. All items
> below are complete; see the root TODO for the per-feature breakdown and the
> "Known gaps / deferred by design" section.
For the why/how see [`PLAN.md`](PLAN.md); for decisions/gotchas see [`MEMORY.md`](MEMORY.md).

## ✅ Phase-1 loose ends — done

- [x] **1. Wire web ↔ live API.** Typed client + TanStack Query hooks behind
      `NEXT_PUBLIC_API_MODE`, live `socket.io-client` event bridge.
- [x] **2. Secure the session stream.** Short-lived session JWT validated at the
      edge; Traefik `sess-auth` middleware points at the internal auth route.
- [x] **3. Enforce the agent token.** `@AgentOnly()` routes validate
      `x-agent-token` with a timing-safe compare against
      `CHISTA_AGENT_ENROLLMENT_TOKEN` (added to `@chista/config`).

## ✅ Verification & infra hardening — done

- [x] **4. Real Docker loop.** `docker compose` launch→stream→terminate path wired
      (Docker + Kubernetes drivers; both teardown leaked resources on failure).
- [x] **5. DB migrations.** Prisma schema is the source of truth; `prisma db push`
      for dev, migrate history for deploy.
- [x] **6. Tests.** Vitest across scheduler, RBAC guard, federation, providers,
      auth, SCIM, sealing, sharing, webhooks (290+ tests, 36 files).
- [x] **7. Hardening.** WS gateway token auth, license enforcement, 2FA
      (TOTP/WebAuthn), full SSO (OIDC/SAML/LDAP).

## ✅ Admin pages — all shipped

Every nav item is a live page wired to its backend — no "coming soon" stubs:
Users · Groups · RBAC matrix · Authentication · Registry/Images · Sessions
(History/Recordings/Staging/Casting/Sharing) · Infrastructure
(Zones/Servers/Pools/AutoScale/VM Providers/DNS) · Storage · Connectivity
(Proxies/Web Filtering/Browser Isolation/Egress) · Settings
(General/Branding/Banners/Licensing/Database/Config) · Observability
(Reporting/Audit/Metrics/Log Forwarding) · Developer (API Keys/Webhooks/API Docs).

## ✅ Backend modules — all have controllers

groups · roles · registry · images · recordings · staging · casting · sharing ·
servers · pools · autoscale · providers (VM) · dns-providers · storage ·
file-mappings · settings · webhooks · reporting · audit · config-portability ·
backups · log-forwarding · connectivity · auth-providers · scim · webauthn.

## ✅ Phases 2–7 — complete

- [x] **Phase 2:** guacd (RDP/VNC/SSH), sharing/chat, recording, profiles, file
      mappings, servers, 2FA/CAPTCHA.
- [x] **Phase 3:** OIDC/SAML/LDAP, multi-zone + staging + casting, pools +
      autoscale + VM providers + DNS, tenant isolation, audit/license/reporting/webhooks.
- [x] **Phase 4:** storage mappings, browser isolation, web filtering, egress,
      Kubernetes driver, Helm.
- [x] **Phases 5–7:** WebAuthn/passkeys, SCIM 2.0, OIDC nonce-binding + RP-logout,
      SAML SLO, 11 VM drivers, AES-256-GCM secret-sealing (providers, auth-configs,
      webhooks, storage, **log-forwarding**), federated-identity provider binding,
      atomic scheduler capacity reservation.

---

### Remaining (operational, not code)

- [ ] Execute the full Docker/K8s launch→stream→terminate loop on real hardware
      (the user's Proxmox homelab) as an end-to-end smoke test.
- [ ] Curated container-image catalog and native desktop/mobile clients — product
      maturity items, out of scope for the core platform.
