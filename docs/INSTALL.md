<div align="center">

<img src="../apps/web/public/asha-logo.svg" alt="ASHA" width="120" height="120" />

# Installing Asha

**A [Naiemi Group](https://github.com/Kalin0x0/Asha) product** · container-streaming / VDI / DaaS

`anthracite #1a1a2e` · `gold #d4af37`

</div>

---

Asha ships with a single, branded installer — `scripts/install.sh` — that takes a
plain Ubuntu (or Debian) box from nothing to a **live, signed-in-ready** Asha in
one command: it installs Docker, generates strong secrets, wires your **domain**
and **TLS**, brings up the full stack, migrates + seeds the database, and prints
your admin login.

When you run it you are greeted by the Asha mark:

```
==============================================================================

                            ######  ######
                        ####      ##      ####
                      ###    ##########    ###
                     ##    ####      ####    ##
                    ##    ##    ####    ##    ##
                    ##    ##   ##  ##   ##    ##
                    ##    ##    ####    ##    ##
                     ##    ####      ####    ##
                      ###    ##########    ###
                        ####      ##      ####
                            ######  ######

         _    ____  _   _    _
        / \  / ___|| | | |  / \
       / _ \ \___ \| |_| | / _ \
      / ___ \ ___) |  _  |/ ___ \
     /_/   \_\____/|_| |_/_/   \_\

              C O N T A I N E R   S T R E A M I N G

==============================================================================

  Naiemi Group  ·  VDI / DaaS Platform                       Installer  v1.0
```

---

## 1. Requirements

| | Minimum | Recommended |
| --- | --- | --- |
| **OS** | Ubuntu 20.04+ / Debian 11+ | Ubuntu 22.04 / 24.04 LTS |
| **CPU** | 2 vCPU | 4+ vCPU (each desktop session ≈ ½ core) |
| **RAM** | 4 GB | 8 GB+ |
| **Disk** | 20 GB | 40 GB+ (container images are large) |
| **Access** | `root` or `sudo` | — |
| **Ports** | `80` + `443` free | a domain pointed at the host |

The installer handles **Docker Engine** and the **Compose v2** plugin for you if
they are not already present.

## 2. Install

### Option A — one command (recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/Kalin0x0/Asha/main/scripts/install.sh | sudo bash
```

You'll be asked for a **domain** and a **TLS email**, then Asha builds and starts.

### Option B — from a clone

```bash
git clone https://github.com/Kalin0x0/Asha.git
cd Asha
sudo bash scripts/install.sh
```

### Option C — fully non-interactive (CI / automation)

```bash
sudo bash scripts/install.sh \
  --domain asha.example.com \
  --email  ops@example.com \
  --yes
```

> Running with no arguments in a terminal opens the **interactive menu**
> (install · configure domain · prerequisites · lifecycle · status · credentials
> · update · uninstall). Running with `--yes` (or piped, with no TTY) performs a
> full install with sensible defaults.

## 3. What the installer does

1. **Detects** your OS, CPU, RAM and privileges.
2. **Installs Docker + Compose** if missing (official `get.docker.com`), enables
   the daemon, and adds your user to the `docker` group.
3. **Locates the source** (the current checkout) or clones it to `/opt/asha`.
4. **Generates `.env`** from the template with cryptographically strong,
   unique secrets — Postgres password, JWT access/refresh, session-token,
   secret-seal key, Guacamole crypt key, agent-enrollment token. **Re-running
   never rotates existing keys**, so your database keeps working.
5. **Wires your domain**: `ASHA_BASE_DOMAIN`, `ASHA_PUBLIC_URL`, `CORS_ORIGIN`,
   `ACME_EMAIL`, and switches the web app to **live** mode (real backend — not
   the demo store).
6. **Configures TLS** — self-signed for a `*.local` test domain, or **automatic
   Let's Encrypt** for a public FQDN (generated `docker-compose.prod.yml`).
7. **Brings up the stack** (`docker compose up -d --build`) — Traefik, Postgres,
   Redis, the API, the web app, the agent, the connection-proxy and guacd.
8. **Migrates + seeds** the database (the `db-migrate` one-shot) and **waits for
   Asha to answer**, then prints your **admin credentials**.

## 4. Domain & TLS

### Local test (`*.local`)

Pick a domain ending in `.local` (the default is `asha.local`). The installer
adds a `127.0.0.1 <domain>` line to `/etc/hosts` and Traefik serves a
**self-signed** certificate. Your browser will warn once — accept and continue.

### Public domain (automatic HTTPS)

1. Point an **A record** for your domain at the server's public IP.
2. Make sure inbound **80** and **443** are open (Let's Encrypt validates over
   port 80 via the TLS-ALPN challenge on 443).
3. Run the installer with `--domain your.domain --email you@domain`.

The installer writes `docker-compose.prod.yml`, which enables the Let's Encrypt
resolver and attaches it to the **core routers only** (`web`, `api`, `proxy`) so
ephemeral per-session routers don't each request a certificate (staying under
Let's Encrypt rate limits). Certificates are persisted in the `traefik-acme`
Docker volume and auto-renewed.

> **Wildcard sessions:** routing many concurrent streamed desktops under
> per-session subdomains is best served by a **wildcard DNS record** plus a
> DNS-01 wildcard certificate. The apex (`web`/`api`/`proxy`) works out of the
> box with the bundled TLS-ALPN challenge.

## 5. After install

Open `https://<your-domain>` and sign in:

| | |
| --- | --- |
| **Email** | `admin@asha.local` |
| **Password** | `AshaAdmin!2026` |

> Set a different seed password **before** the first install by exporting
> `ASHA_SEED_ADMIN_PASSWORD` (or adding it to `.env`). **Change the admin
> password after first sign-in** under **Settings → Security**.

API docs (Swagger) live at `https://<your-domain>/api/docs`.

## 6. Managing the stack

The installer is also your control panel — run it again any time, or use the
sub-commands:

```bash
sudo bash scripts/install.sh status      # stack status + container health
sudo bash scripts/install.sh logs        # tail logs
sudo bash scripts/install.sh restart     # restart services
sudo bash scripts/install.sh update      # git pull + rebuild + restart
sudo bash scripts/install.sh uninstall   # stop and remove data volumes
sudo bash scripts/install.sh menu        # the interactive menu
```

Or drive Compose directly from the install directory:

```bash
cd /opt/asha            # or your checkout
docker compose ps
docker compose logs -f api
```

## 7. Configuration reference

The installer sets these keys in `.env` (see [`.env.example`](../.env.example)
for the full annotated list):

| Key | Set to | Notes |
| --- | --- | --- |
| `ASHA_BASE_DOMAIN` | your domain | the host Traefik routes on |
| `ASHA_PUBLIC_URL` | `https://<domain>` | public base URL |
| `ACME_EMAIL` | your email | Let's Encrypt registration |
| `CORS_ORIGIN` | `https://<domain>,…` | allowed browser origins |
| `NEXT_PUBLIC_API_MODE` | `live` | **active backend** (not the demo store) |
| `POSTGRES_PASSWORD` | random 24-byte hex | generated once |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | random | session signing |
| `SESSION_TOKEN_SECRET` | random | per-session stream token |
| `SECRET_SEAL_KEY` | random | seals provider secrets at rest |
| `GUAC_CRYPT_SECRET` | random (exactly 32 chars) | Guacamole token crypto |
| `ASHA_AGENT_ENROLLMENT_TOKEN` | random | agent ↔ manager trust |

## 8. Troubleshooting

| Symptom | Fix |
| --- | --- |
| **Ports 80/443 in use** | Stop the conflicting service (e.g. `apache2`, `nginx`) or free the ports; the installer warns if they're busy. |
| **Let's Encrypt fails** | Confirm the A record resolves to this host and 80/443 are reachable from the internet; check `docker compose logs traefik`. |
| **Browser cert warning on `*.local`** | Expected — `*.local` uses a self-signed cert. Accept it, or use a real domain. |
| **Stuck at "Allocating an agent"** | The agent and API must share `ASHA_AGENT_ENROLLMENT_TOKEN` (the installer keeps them in sync); check `docker compose logs agent`. |
| **A "demo mode" panel instead of a desktop** | The web app is in `mock` mode — re-run with `--mode live` (the default) and rebuild. |
| **Daemon not reachable** | Start Docker: `sudo systemctl enable --now docker`, then re-run. |

## 9. Security notes

- All secrets are generated locally with `openssl rand` (falling back to
  `/dev/urandom`) and the `.env` file is `chmod 600`.
- Never commit `.env` or the generated `docker-compose.prod.yml` (both are
  git-ignored).
- Rotate the seeded admin password immediately, and prefer SSO/passkeys for real
  deployments (**Access → Authentication**).

---

<div align="center">

— built by **Naiemi Group** —

</div>
