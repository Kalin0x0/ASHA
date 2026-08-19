<div align="center">

<img src="../apps/web/public/asha-logo.svg" alt="ASHA" width="120" height="120" />

# Installing Asha on Windows

**A [Naiemi Group](https://github.com/Kalin0x0/Asha) product** · container-streaming / VDI / DaaS

`Windows 10/11` · `PowerShell` · `Docker Desktop + WSL 2`

</div>

---

This guide takes a Windows workstation from a fresh clone to a complete local
Asha deployment and a contributor-ready development environment. Asha runs in
**Linux containers** through Docker Desktop; Windows containers are not
supported.

Looking for a Linux server deployment? Use the
[Ubuntu/Debian installation guide](INSTALL.md).

## 1. Requirements

| | Minimum | Recommended |
| --- | --- | --- |
| **OS** | 64-bit Windows 10 or Windows 11 | Current Windows 11 |
| **Virtualization** | Enabled in BIOS/UEFI | Enabled |
| **WSL** | WSL 2 | Current WSL 2 kernel |
| **CPU** | 4 logical cores | 8+ logical cores |
| **RAM** | 8 GB | 16 GB+ |
| **Disk** | 30 GB free | 50 GB+ on SSD |
| **Runtime** | Docker Desktop using Linux containers | Current stable Docker Desktop |
| **Development** | Git, Node.js 20+, pnpm 9.15.9 | Node.js 22 |
| **Ports** | TCP 80 and 443 free | — |

> [!IMPORTANT]
> Docker Desktop must be using its **Linux container engine**. Asha's PostgreSQL,
> Redis, Traefik, guacd, API, web, and session images are Linux containers.

## 2. Prepare Windows

Open **PowerShell as Administrator** and verify virtualization:

```powershell
Get-ComputerInfo -Property HyperVRequirementVirtualizationFirmwareEnabled
```

If WSL is not installed, install it and restart Windows:

```powershell
wsl --install
```

After the restart, update WSL:

```powershell
wsl --update
wsl --status
```

Install Git and Docker Desktop with `winget`:

```powershell
winget install --id Git.Git --exact
winget install --id Docker.DockerDesktop --exact
```

Start Docker Desktop, accept its WSL 2 integration prompt, and wait until it
reports that the engine is running. Confirm both Docker and Compose:

```powershell
docker version
docker compose version
docker info --format '{{.OSType}}'
```

The last command must print `linux`.

## 3. Clone the repository

For read-only evaluation, clone the upstream repository:

```powershell
git clone https://github.com/Kalin0x0/ASHA.git
Set-Location ASHA
```

For contributing, fork Asha on GitHub and clone your fork instead:

```powershell
git clone https://github.com/YOUR-GITHUB-USER/ASHA.git
Set-Location ASHA
git remote add upstream https://github.com/Kalin0x0/ASHA.git
git remote -v
```

## 4. Install the full stack

The Windows installer is `scripts/install.ps1`. It:

1. Locates Docker Desktop even when a newly installed CLI is not yet in `PATH`.
2. Starts Docker Desktop and waits for its Linux engine.
3. Creates `.env` from `.env.example`.
4. Replaces development placeholders with strong random secrets without
   rotating existing secrets on later runs.
5. Configures the domain, CORS, live API mode, and seeded administrator.
6. Adds a local domain to the Windows hosts file when PowerShell is elevated.
7. Builds and starts Traefik, PostgreSQL, Redis, API, web, agent, guacd, and the
   connection proxy.
8. Runs the idempotent database sync and seed through `db-migrate`.
9. Waits for the site and prints the login details.

Allow scripts for the current PowerShell process, then install:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\scripts\install.ps1 install
```

If Docker Desktop is not installed yet, the installer can request it through
`winget`:

```powershell
.\scripts\install.ps1 install -InstallPrerequisites
```

If Docker Desktop requests a restart, restart Windows and run the same command
again. The installer is idempotent and preserves the `.env` secrets it already
created.

For a non-interactive local setup:

```powershell
.\scripts\install.ps1 install -Domain asha.local -Mode live -Yes
```

## 5. Manual installation

Use these steps if you prefer to drive Docker Compose directly.

Create the local environment:

```powershell
Copy-Item .env.example .env
$envPath = (Resolve-Path .env).Path
$envText = [System.IO.File]::ReadAllText($envPath)
$envText = $envText -replace '(?m)^NEXT_PUBLIC_API_MODE=.*$', 'NEXT_PUBLIC_API_MODE=live'
[System.IO.File]::WriteAllText(
  $envPath,
  $envText,
  [System.Text.UTF8Encoding]::new($false)
)
```

Add the local domain. Run this command in an **elevated PowerShell**:

```powershell
$hostsFile = Join-Path $env:SystemRoot 'System32\drivers\etc\hosts'
if (-not (Select-String -Path $hostsFile -Pattern '\basha\.local\b' -Quiet)) {
  Add-Content -Path $hostsFile -Value "`r`n127.0.0.1 asha.local"
}
ipconfig /flushdns
```

Build and start the complete stack:

```powershell
docker compose up -d --build
docker compose ps
```

The first build can take several minutes because the custom guacd image compiles
FreeRDP and H.264 support.

Verify the API:

```powershell
curl.exe -k https://asha.local/api/v1/health/ready
```

Expected result:

```json
{"status":"ready","db":"up","redis":"up"}
```

## 6. Sign in

Open [https://asha.local](https://asha.local).

Traefik uses a self-signed certificate for `*.local`. The first browser visit
will show a certificate warning; accept it for this local development domain.

| Field | Local default |
| --- | --- |
| **Email** | `admin@asha.local` |
| **Password** | `AshaAdmin!2026` |
| **API documentation** | `https://asha.local/api/docs` |

The installer preserves an existing `ASHA_SEED_ADMIN_PASSWORD` from `.env`.
Change the password after signing in.

## 7. Manage the stack

Use the PowerShell helper from the repository root:

```powershell
.\scripts\install.ps1 status
.\scripts\install.ps1 start
.\scripts\install.ps1 stop
.\scripts\install.ps1 restart
.\scripts\install.ps1 logs
.\scripts\install.ps1 credentials
.\scripts\install.ps1 update
```

Or use Compose directly:

```powershell
docker compose ps
docker compose logs -f api
docker compose restart web api
docker compose down
```

`docker compose down` keeps database and Redis volumes. The following commands
delete local data and must be used intentionally:

```powershell
.\scripts\install.ps1 uninstall
# Equivalent destructive Compose command:
docker compose down -v --remove-orphans
```

## 8. Contributor setup

Install Node.js and activate the repository's pinned pnpm version:

```powershell
winget install --id OpenJS.NodeJS.LTS --exact
corepack enable
corepack prepare pnpm@9.15.9 --activate
node --version
pnpm --version
```

Open a new PowerShell window if Node.js was just installed, then install
dependencies:

```powershell
pnpm install --frozen-lockfile
pnpm db:generate
```

Run the same quality gates as CI:

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

For fast frontend work without Docker, keep `.env` in mock mode and run:

```powershell
Copy-Item .env.example .env -ErrorAction SilentlyContinue
pnpm dev:web
```

Open [http://localhost:3000](http://localhost:3000). Mock mode accepts any login
credentials and uses deterministic local data.

For end-to-end work, use the full Docker stack. Rebuild only the service you
changed:

```powershell
docker compose up -d --build web
docker compose up -d --build api
docker compose up -d --build agent
```

## 9. Git contribution workflow

Synchronize your fork and create a focused branch:

```powershell
git fetch upstream
git switch main
git merge --ff-only upstream/main
git switch -c docs/windows-install
```

After making changes:

```powershell
git status
git diff
pnpm typecheck
pnpm lint
pnpm test
pnpm build
git add <files-you-changed>
git commit -m "docs: add Windows installation guide"
git push -u origin docs/windows-install
```

Then open a pull request from your fork to `Kalin0x0/ASHA:main`. Keep `.env`,
certificates, local databases, build output, and generated
`docker-compose.prod.yml` out of the commit; they are already covered by
`.gitignore`.

## 10. Public domain and automatic HTTPS

Windows is best suited to local development. For a stable public deployment,
the Ubuntu/Debian installer remains the recommended production path.

For testing a public FQDN on Windows:

1. Point its DNS A record to the Windows host's public IP.
2. Forward inbound TCP 80 and 443 through the router and Windows Firewall.
3. Keep Docker Desktop running.
4. Run:

```powershell
.\scripts\install.ps1 install `
  -Domain asha.example.com `
  -Email ops@example.com `
  -Yes
```

The installer creates the git-ignored `docker-compose.prod.yml` override and
enables Let's Encrypt through Traefik. Do not expose a development workstation
to the internet without reviewing firewall, secret, backup, and update policy.

## 11. Troubleshooting

| Symptom | Resolution |
| --- | --- |
| `docker` is not recognized | Open a new PowerShell window or run the installer; it also checks Docker Desktop's standard install path. |
| Docker reports a Windows engine | Docker Desktop tray menu → **Switch to Linux containers**. |
| WSL error or engine never starts | Run `wsl --update`, restart Windows, then start Docker Desktop. |
| Ports 80/443 are occupied | Run `Get-NetTCPConnection -State Listen -LocalPort 80,443` and stop or reconfigure the conflicting service. |
| `asha.local` does not resolve | Add `127.0.0.1 asha.local` to the hosts file from elevated PowerShell, then run `ipconfig /flushdns`. |
| Browser certificate warning | Expected for the local self-signed certificate. Accept it only for your local Asha domain. |
| Web app shows demo/mock data | Set `NEXT_PUBLIC_API_MODE=live` in `.env`, then rebuild: `docker compose up -d --build web`. |
| API is not ready | Run `docker compose ps` and `docker compose logs --tail=200 api postgres redis db-migrate`. |
| Session stays on “Allocating an agent” | Compare `ASHA_AGENT_ENROLLMENT_TOKEN` for API and agent, then inspect `docker compose logs agent api`. |
| guacd build fails | Retry `docker compose up -d --build guacd connection-proxy`; KasmVNC does not require guacd. |
| Docker disk usage grows | Docker Desktop → **Settings → Resources**, or inspect with `docker system df`. Avoid pruning images while sessions are active. |

## 12. Security notes

- Never commit `.env`; it contains database, JWT, encryption, and agent secrets.
- The installer rotates shipped placeholders only once and preserves subsequent
  values.
- Use the local default password only on a private development machine.
- Do not bypass TLS warnings for unrelated or public domains.
- Review `git diff --cached` before every contribution.

---

<div align="center">

— built by **Naiemi Group** —

</div>
