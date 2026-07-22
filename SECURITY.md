# Security Policy

Asha is a self-hosted platform that brokers remote access to isolated desktops,
browsers and apps. Security is a first-class concern, and we appreciate reports
from the community.

## Supported versions

Asha ships from `main` (rolling). Security fixes land on `main` and the latest
tagged release. Please make sure you are running the latest version before
reporting an issue.

| Version        | Supported          |
| -------------- | ------------------ |
| `main` (latest)| :white_check_mark: |
| Older tags     | :x:                |

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report privately through **GitHub Private Vulnerability Reporting**: open the
repository's **Security → Report a vulnerability** tab, or use the
[new advisory form](https://github.com/Kalin0x0/ASHA/security/advisories/new)
directly. This creates a private advisory visible only to the maintainers, so
the issue stays confidential until a fix ships.

When reporting, please include:

- A description of the issue and its impact.
- Steps to reproduce (a proof-of-concept helps).
- Affected component (`apps/api`, `apps/web`, `apps/agent`,
  `apps/connection-proxy`, or a package) and version/commit.
- Any suggested remediation, if you have one.

## What to expect

- **Acknowledgement** within 3 business days.
- An initial assessment and severity triage within 7 business days.
- Coordinated disclosure: we will agree on a timeline with you and credit you in
  the advisory (unless you prefer to remain anonymous).

## Scope

In scope: the code in this repository — the API, web app, agent,
connection-proxy, and shared packages, plus their default configuration.

Out of scope: third-party dependencies (report upstream, but do tell us so we can
pin/patch), and issues that require a pre-compromised host or physical access.

## Hardening reminders for operators

Asha is self-hosted; a secure deployment is a shared responsibility:

- **Change every default** — set strong `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`,
  `SESSION_TOKEN_SECRET`, database and Redis credentials, and override
  `ASHA_SEED_ADMIN_PASSWORD` before first boot. See [`.env.example`](.env.example).
- **Terminate TLS** in front of the stack (the default compose serves HTTP behind
  a reverse proxy/Traefik).
- **Restrict the agent enrollment token** and keep agents on a private network.
- Keep the host, Docker/Kubernetes runtime and workspace images patched.
