#!/usr/bin/env bash
#
# ╔══════════════════════════════════════════════════════════════════════════╗
# ║  Asha — one-command installer for Ubuntu / Debian                         ║
# ║  A Naiemi Group product · container-streaming / VDI / DaaS                ║
# ╚══════════════════════════════════════════════════════════════════════════╝
#
# Brings up the full Asha stack with Docker Compose, wires it to your domain,
# issues TLS, migrates + seeds the database and leaves Asha live and ready to
# sign in — all from a single command.
#
# Quick start (from a cloned repo):
#     sudo bash scripts/install.sh
#
# Or straight from the web:
#     curl -fsSL https://raw.githubusercontent.com/Kalin0x0/Asha/main/scripts/install.sh | sudo bash
#
# Non-interactive (CI / automation):
#     sudo bash scripts/install.sh --domain asha.example.com \
#          --email admin@example.com --yes
#
# Everything is idempotent: re-running keeps your existing secrets and only
# applies what changed.
#
set -Eeuo pipefail

# ── Constants ────────────────────────────────────────────────────────────────
readonly SCRIPT_VERSION="1.0.0"
readonly PRODUCT="Asha"
readonly VENDOR="Naiemi Group"
readonly DEFAULT_REPO="https://github.com/Kalin0x0/Asha.git"
readonly DEFAULT_DOMAIN="asha.local"
readonly RULE_CHAR="="
ASHA_REPO="${ASHA_REPO:-$DEFAULT_REPO}"

# ── Mutable state (overridable via flags / env) ──────────────────────────────
DOMAIN=""
ACME_EMAIL=""
APP_MODE="live"          # live = backend active (the default) | mock = demo data
ASSUME_YES="false"
ACTION=""                # express | menu | uninstall | status | help
ASHA_DIR=""
DC=""                    # resolved docker-compose command
ENV_FILE=""
declare -a COMPOSE_FILES=()

# ── Colors (gold-on-anthracite; auto-off when not a TTY / NO_COLOR) ───────────
setup_colors() {
  if [ -t 1 ] && [ -z "${NO_COLOR:-}" ] && [ "${TERM:-}" != "dumb" ]; then
    C_RESET=$'\033[0m'
    C_GOLD=$'\033[38;5;178m'; C_GOLDB=$'\033[1;38;5;220m'
    C_GREEN=$'\033[1;32m'; C_RED=$'\033[1;31m';    C_YEL=$'\033[33m'
    C_CYAN=$'\033[36m';    C_WHITE=$'\033[1;37m';  C_GREY=$'\033[38;5;245m'
  else
    C_RESET=''; C_GOLD=''; C_GOLDB=''; C_GREEN=''
    C_RED=''; C_YEL=''; C_CYAN=''; C_WHITE=''; C_GREY=''
  fi
}

# ── Logging helpers ──────────────────────────────────────────────────────────
rule()  { printf '%s' "$C_GREY"; printf '%*s\n' 78 '' | tr ' ' "$RULE_CHAR"; printf '%s' "$C_RESET"; }
say()   { printf '%b\n' "$*"; }
info()  { printf '%b\n' "  ${C_CYAN}[*]${C_RESET} $*"; }
ok()    { printf '%b\n' "  ${C_GREEN}[+]${C_RESET} $*"; }
warn()  { printf '%b\n' "  ${C_YEL}[!]${C_RESET} $*" >&2; }
err()   { printf '%b\n' "  ${C_RED}[x]${C_RESET} $*" >&2; }
die()   { err "$*"; exit 1; }
step()  { printf '\n%b\n' "${C_GOLDB}▸ $*${C_RESET}"; }

# ── Banner — the ASHA mark + Naiemi Group wordmark ───────────────────────────
banner() {
  [ -t 1 ] && { clear 2>/dev/null || true; }
  printf '\n'
  rule
  printf '%b' "$C_GOLDB"
  cat <<'ART'

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

ART
  printf '%b' "$C_RESET"
  printf '%b\n' "              ${C_GOLD}C O N T A I N E R   S T R E A M I N G${C_RESET}"
  printf '\n'
  rule
  printf '%b\n' "  ${C_WHITE}${VENDOR}${C_RESET}  ${C_GREY}·${C_RESET}  VDI / DaaS Platform${C_GREY}$(printf '%*s' 24 '')Installer  v${SCRIPT_VERSION}${C_RESET}"
  printf '\n'
}

# ── Small utilities ──────────────────────────────────────────────────────────
have() { command -v "$1" >/dev/null 2>&1; }

# Read a value from /dev/tty so prompts work even under `curl | bash`.
ask() {
  local prompt="$1" default="${2:-}" reply=""
  if [ "$ASSUME_YES" = "true" ] || ! [ -r /dev/tty ]; then
    printf '%s\n' "$default"; return 0
  fi
  if [ -n "$default" ]; then
    printf '%b' "  ${C_CYAN}?${C_RESET} ${prompt} ${C_GREY}[${default}]${C_RESET}: " >/dev/tty
  else
    printf '%b' "  ${C_CYAN}?${C_RESET} ${prompt}: " >/dev/tty
  fi
  IFS= read -r reply </dev/tty || reply=""
  printf '%s\n' "${reply:-$default}"
}

confirm() {
  local prompt="$1" reply=""
  if [ "$ASSUME_YES" = "true" ]; then return 0; fi
  if ! [ -r /dev/tty ]; then return 1; fi
  printf '%b' "  ${C_YEL}?${C_RESET} ${prompt} ${C_GREY}[y/N]${C_RESET}: " >/dev/tty
  IFS= read -r reply </dev/tty || reply=""
  case "$reply" in [yY]|[yY][eE][sS]) return 0 ;; *) return 1 ;; esac
}

# Cryptographically strong hex secret; bytes -> 2*bytes hex chars.
gen_secret() {
  local bytes="${1:-24}"
  if have openssl; then openssl rand -hex "$bytes"
  elif [ -r /dev/urandom ]; then head -c "$bytes" /dev/urandom | od -An -tx1 | tr -d ' \n'
  else die "No openssl or /dev/urandom available to generate secrets."; fi
}

# A FQDN that ends in .local / .localhost / is localhost / is an IP → "local"
# (self-signed TLS, hosts entry). Anything else → public (Let's Encrypt).
is_local_domain() {
  case "$1" in
    *.local|*.localhost|localhost) return 0 ;;
    *.*) : ;;                 # has a dot → fall through to the IP/FQDN test
    *) return 0 ;;            # no dot at all → not a public FQDN → local
  esac
  case "$1" in
    *[!0-9.]*) return 1 ;;    # has a non-(digit/dot) char → a real FQDN → public
    *) return 0 ;;            # only digits + dots → a bare IPv4 → local
  esac
}

# Upsert KEY=VALUE in an env file (replace first match, else append).
set_env() {
  local key="$1" val="$2" file="${3:-$ENV_FILE}" tmp
  tmp="$(mktemp)"
  if grep -qE "^${key}=" "$file" 2>/dev/null; then
    # Value is passed via the environment (ENVIRON), NOT `awk -v`: that keeps
    # secrets out of the process argv (/proc/<pid>/cmdline) and stops awk from
    # interpreting backslash escapes in the value. Only the (non-secret) key
    # goes via -v.
    v="$val" awk -v k="$key" '
      !done && $0 ~ "^"k"=" { print k"="ENVIRON["v"]; done=1; next }
      { print }
    ' "$file" >"$tmp"
    mv "$tmp" "$file"
  else
    rm -f "$tmp"
    printf '%s=%s\n' "$key" "$val" >>"$file"
  fi
}

get_env() {
  local key="$1" file="${2:-$ENV_FILE}"
  [ -f "$file" ] || return 0
  grep -E "^${key}=" "$file" 2>/dev/null | head -n1 | cut -d= -f2-
}

# ── Privileges ───────────────────────────────────────────────────────────────
SUDO=""
require_privileges() {
  if [ "$(id -u)" -ne 0 ]; then
    if have sudo; then
      SUDO="sudo"
    else
      die "Run as root (or install sudo): sudo bash scripts/install.sh"
    fi
  fi
}

# ── Environment detection ────────────────────────────────────────────────────
detect_os() {
  OS_NAME="unknown"; OS_ID=""; OS_LIKE=""
  if [ -r /etc/os-release ]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    OS_NAME="${PRETTY_NAME:-${NAME:-unknown}}"
    OS_ID="${ID:-}"
    OS_LIKE="${ID_LIKE:-}"
  fi
  case "$OS_ID $OS_LIKE" in
    *ubuntu*|*debian*) : ;;
    *) warn "Asha is tuned for Ubuntu/Debian. Detected: ${OS_NAME}. Continuing best-effort." ;;
  esac
}

detect_hardware() {
  CPU_CORES="$(nproc 2>/dev/null || echo '?')"
  if [ -r /proc/meminfo ]; then
    local kb; kb="$(awk '/MemTotal/{print $2}' /proc/meminfo 2>/dev/null || echo 0)"
    RAM_GB="$(awk -v k="$kb" 'BEGIN{printf "%.1f", k/1048576}')"
  else
    RAM_GB="?"
  fi
  ARCH="$(uname -m 2>/dev/null || echo '?')"
}

# ── Docker ───────────────────────────────────────────────────────────────────
resolve_compose() {
  if docker compose version >/dev/null 2>&1; then DC="docker compose"
  elif have docker-compose; then DC="docker-compose"
  else DC=""; fi
}

docker_ready() { have docker && docker info >/dev/null 2>&1; }

ensure_docker() {
  step "Docker engine + Compose"
  if have docker; then
    ok "Docker present: $(docker --version 2>/dev/null | sed 's/,.*//')"
  else
    info "Docker not found — installing via the official convenience script…"
    if have curl; then
      curl -fsSL https://get.docker.com | $SUDO sh
    elif have wget; then
      wget -qO- https://get.docker.com | $SUDO sh
    else
      $SUDO apt-get update -y && $SUDO apt-get install -y curl
      curl -fsSL https://get.docker.com | $SUDO sh
    fi
    ok "Docker installed."
  fi

  # Start + enable the daemon if systemd is managing it.
  if have systemctl; then
    $SUDO systemctl enable --now docker >/dev/null 2>&1 || true
  fi

  resolve_compose
  if [ -z "$DC" ]; then
    info "Installing the Docker Compose plugin…"
    $SUDO apt-get update -y >/dev/null 2>&1 || true
    $SUDO apt-get install -y docker-compose-plugin >/dev/null 2>&1 || true
    resolve_compose
  fi
  [ -n "$DC" ] || die "Docker Compose v2 is required but could not be installed."
  ok "Compose ready: $($DC version 2>/dev/null | head -n1)"

  # Let a non-root invoking user drive Docker after re-login.
  if [ -n "$SUDO" ] && [ -n "${SUDO_USER:-}" ] && [ "${SUDO_USER}" != "root" ]; then
    $SUDO usermod -aG docker "$SUDO_USER" 2>/dev/null || true
  fi

  docker_ready || die "Docker is installed but the daemon is not reachable. Start it and re-run."
}

# ── Repository ───────────────────────────────────────────────────────────────
find_repo_root() {
  local d="$1"
  while [ "$d" != "/" ] && [ -n "$d" ]; do
    if [ -f "$d/docker-compose.yml" ] && [ -d "$d/apps" ]; then
      printf '%s\n' "$d"; return 0
    fi
    d="$(dirname "$d")"
  done
  return 1
}

ensure_repo() {
  step "Asha source"
  local here
  if ! here="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd)"; then here="$PWD"; fi
  if ASHA_DIR="$(find_repo_root "$here")"; then
    ok "Using repository at ${C_WHITE}${ASHA_DIR}${C_RESET}"
  elif ASHA_DIR="$(find_repo_root "$PWD")"; then
    ok "Using repository at ${C_WHITE}${ASHA_DIR}${C_RESET}"
  else
    local target="${ASHA_INSTALL_DIR:-/opt/asha}"
    info "No checkout found — cloning ${ASHA_REPO} → ${target}"
    have git || { $SUDO apt-get update -y >/dev/null 2>&1 || true; $SUDO apt-get install -y git >/dev/null 2>&1 || true; }
    have git || die "git is required to fetch the source."
    if [ ! -d "$target/.git" ]; then
      $SUDO mkdir -p "$(dirname "$target")"
      $SUDO git clone --depth 1 "$ASHA_REPO" "$target" || die "Clone failed (set ASHA_REPO to a reachable URL)."
    fi
    ASHA_DIR="$target"
    ok "Cloned to ${C_WHITE}${ASHA_DIR}${C_RESET}"
  fi
  ENV_FILE="$ASHA_DIR/.env"
  cd "$ASHA_DIR"
}

# ── .env generation (secrets + domain) ───────────────────────────────────────
configure_env() {
  step "Configuration"
  local fresh="false"
  if [ ! -f "$ENV_FILE" ]; then
    [ -f "$ASHA_DIR/.env.example" ] || die ".env.example missing — is this an Asha checkout?"
    cp "$ASHA_DIR/.env.example" "$ENV_FILE"
    fresh="true"
    info "Created .env from template."
  else
    info "Existing .env found — preserving its secrets."
  fi
  # Lock the file down BEFORE any secret is written into it (no world-readable
  # window). set_env's mktemp+mv preserves these perms thereafter.
  chmod 600 "$ENV_FILE" 2>/dev/null || true

  # Generate secrets only when they are still the shipped dev placeholders, so
  # re-running never rotates keys out from under a live database.
  rotate_if_default POSTGRES_PASSWORD "asha_dev_change_me"            "$(gen_secret 24)"
  rotate_if_default JWT_ACCESS_SECRET "dev-access-secret-change-me-please-32++chars"   "$(gen_secret 24)"
  rotate_if_default JWT_REFRESH_SECRET "dev-refresh-secret-change-me-please-32++chars" "$(gen_secret 24)"
  rotate_if_default SESSION_TOKEN_SECRET "dev-session-token-secret-change-me-32++chars" "$(gen_secret 24)"
  rotate_if_default SECRET_SEAL_KEY "0123456789abcdef0123456789abcdef" "$(gen_secret 32)"
  rotate_if_default GUAC_CRYPT_SECRET "MySuperSecretKeyForParamsToken12" "$(gen_secret 16)"
  rotate_if_default ASHA_AGENT_ENROLLMENT_TOKEN "dev-enrollment-token-change-me" "$(gen_secret 16)"

  # Keep DATABASE_URL (host-side tooling) consistent with the generated password.
  local pg_pw pg_user pg_db
  pg_pw="$(get_env POSTGRES_PASSWORD)"; pg_user="$(get_env POSTGRES_USER)"; pg_db="$(get_env POSTGRES_DB)"
  pg_user="${pg_user:-asha}"; pg_db="${pg_db:-asha}"
  set_env POSTGRES_USER "$pg_user"
  set_env POSTGRES_DB "$pg_db"
  set_env DATABASE_URL "postgresql://${pg_user}:${pg_pw}@localhost:5432/${pg_db}?schema=public"

  # Domain + URLs.
  set_env ASHA_BASE_DOMAIN "$DOMAIN"
  set_env ASHA_BASE_DOMAIN_ALT "$DOMAIN"
  set_env ASHA_PUBLIC_URL "https://${DOMAIN}"
  set_env ASHA_TRAEFIK_DOMAIN "$DOMAIN"
  set_env ACME_EMAIL "$ACME_EMAIL"
  set_env CORS_ORIGIN "https://${DOMAIN},http://localhost:3000"
  set_env NEXT_PUBLIC_API_URL "https://${DOMAIN}/api/v1"
  set_env NEXT_PUBLIC_WS_URL ""

  # Make Asha *active*: live backend, not the mock demo store.
  set_env NEXT_PUBLIC_API_MODE "$APP_MODE"

  # Seeded admin password. Keep the friendly default for a *.local test box;
  # generate a strong one for a public, internet-reachable deployment so it is
  # never protected by the publicly-documented default. Compose passes this into
  # the db-migrate (seed) container; show_credentials prints the live value.
  if [ -z "$(get_env ASHA_SEED_ADMIN_PASSWORD)" ]; then
    if is_local_domain "$DOMAIN"; then
      set_env ASHA_SEED_ADMIN_PASSWORD "AshaAdmin!2026"
    else
      set_env ASHA_SEED_ADMIN_PASSWORD "$(gen_secret 18)"
      info "Generated a strong admin password (shown at the end)."
    fi
  fi

  $SUDO chmod 600 "$ENV_FILE" 2>/dev/null || chmod 600 "$ENV_FILE" 2>/dev/null || true
  ok "Wrote ${C_WHITE}.env${C_RESET} (domain ${C_WHITE}${DOMAIN}${C_RESET}, mode ${C_WHITE}${APP_MODE}${C_RESET})."
  [ "$fresh" = "true" ] && info "Secrets generated and sealed (chmod 600)."
}

rotate_if_default() {
  local key="$1" placeholder="$2" newval="$3" cur
  cur="$(get_env "$key")"
  if [ -z "$cur" ] || [ "$cur" = "$placeholder" ]; then
    set_env "$key" "$newval"
  fi
}

# ── Production TLS override (Let's Encrypt) for a public domain ───────────────
write_prod_override() {
  local f="$ASHA_DIR/docker-compose.prod.yml"
  cat >"$f" <<'YAML'
# ─────────────────────────────────────────────────────────────────────────────
# GENERATED by scripts/install.sh — Let's Encrypt TLS for a public domain.
# Re-run the installer to regenerate. Compose `command:` fully replaces the base
# traefik command, so the base flags are repeated here verbatim plus ACME.
# The certresolver is attached only to the core routers (web/api/proxy) — not to
# ephemeral per-session routers — to stay well under Let's Encrypt rate limits.
# ─────────────────────────────────────────────────────────────────────────────
name: asha
services:
  traefik:
    command:
      - --providers.docker=true
      - --providers.docker.exposedByDefault=false
      - --providers.docker.network=asha-edge
      - --providers.file.directory=/etc/traefik/dynamic
      - --providers.file.watch=true
      - --entrypoints.web.address=:80
      - --entrypoints.websecure.address=:443
      - --entrypoints.web.http.redirections.entrypoint.to=websecure
      - --entrypoints.web.http.redirections.entrypoint.scheme=https
      - --api.dashboard=true
      - --certificatesresolvers.le.acme.tlschallenge=true
      - --certificatesresolvers.le.acme.email=${ACME_EMAIL:-admin@asha.local}
      - --certificatesresolvers.le.acme.storage=/letsencrypt/acme.json
  web:
    labels:
      - traefik.http.routers.web.tls.certresolver=le
  api:
    labels:
      - traefik.http.routers.api.tls.certresolver=le
  connection-proxy:
    labels:
      - traefik.http.routers.proxy.tls.certresolver=le
YAML
  ok "Wrote ${C_WHITE}docker-compose.prod.yml${C_RESET} (automatic HTTPS via Let's Encrypt)."
}

select_compose_files() {
  COMPOSE_FILES=(-f "$ASHA_DIR/docker-compose.yml")
  if ! is_local_domain "$DOMAIN"; then
    write_prod_override
    COMPOSE_FILES+=(-f "$ASHA_DIR/docker-compose.prod.yml")
  fi
}

compose() { ( cd "$ASHA_DIR" && $DC "${COMPOSE_FILES[@]}" "$@" ); }

# ── Hosts entry for *.local domains ──────────────────────────────────────────
ensure_hosts_entry() {
  is_local_domain "$DOMAIN" || return 0
  if grep -qE "[[:space:]]${DOMAIN}(\$|[[:space:]])" /etc/hosts 2>/dev/null; then return 0; fi
  step "Hosts entry"
  if printf '127.0.0.1 %s\n' "$DOMAIN" | $SUDO tee -a /etc/hosts >/dev/null 2>&1; then
    ok "Mapped ${C_WHITE}${DOMAIN}${C_RESET} → 127.0.0.1 in /etc/hosts"
  else
    warn "Could not edit /etc/hosts — add '127.0.0.1 ${DOMAIN}' manually."
  fi
}

# ── Port pre-flight ──────────────────────────────────────────────────────────
check_ports() {
  local busy=""
  for p in 80 443; do
    if have ss && $SUDO ss -ltn 2>/dev/null | grep -qE "[:.]${p}[[:space:]]"; then
      busy="${busy} ${p}"
    elif have lsof && $SUDO lsof -iTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1; then
      busy="${busy} ${p}"
    fi
  done
  if [ -n "$busy" ]; then
    warn "Ports in use:${busy} — Traefik needs 80 and 443. Free them or the bring-up may fail."
  fi
}

# ── Deploy ───────────────────────────────────────────────────────────────────
deploy() {
  step "Building and starting Asha (this can take a few minutes)…"
  # Bring up the core stack first. guacd is compiled from source (RDP/VNC only;
  # the primary KasmVNC path doesn't need it), so it's built best-effort — a
  # transient build/network failure there must not block the whole install.
  compose up -d --build traefik postgres redis db-migrate api web agent
  ok "Core services started."
  if compose up -d --build guacd connection-proxy; then
    ok "RDP/VNC bridge (guacd + connection-proxy) started."
  else
    warn "guacd/connection-proxy did not start — KasmVNC works; RDP/VNC is unavailable."
    warn "Retry later with: cd ${ASHA_DIR} && ${DC} ${COMPOSE_FILES[*]} up -d --build guacd connection-proxy"
  fi
}

wait_health() {
  step "Waiting for Asha to come online…"
  # Resolve to the local Traefik so the check works before public DNS has
  # propagated (and despite hairpin-NAT); -k ignores the self-signed/ACME cert.
  local url="https://${DOMAIN}/" code="" i=0 tries=60
  while [ "$i" -lt "$tries" ]; do
    code="$(curl -ksS -o /dev/null -w '%{http_code}' --resolve "${DOMAIN}:443:127.0.0.1" --max-time 5 "$url" 2>/dev/null || echo 000)"
    case "$code" in
      2*|3*) ok "Asha is responding (HTTP ${code})."; return 0 ;;
    esac
    i=$((i + 1))
    printf '\r  %b waiting… (%ss)  last=%s   ' "${C_CYAN}[*]${C_RESET}" "$((i * 3))" "$code"
    sleep 3
  done
  printf '\n'
  warn "Asha did not answer on ${url} within $((tries * 3))s."
  warn "Check the logs:  ${C_WHITE}cd ${ASHA_DIR} && ${DC} logs -f${C_RESET}"
  return 1
}

# ── Status / credentials ─────────────────────────────────────────────────────
status_block() {
  local mode_label dom_label docker_label
  if [ "$APP_MODE" = "live" ]; then mode_label="${C_GREEN}live${C_RESET} (backend active)"; else mode_label="${C_YEL}mock${C_RESET} (demo data)"; fi
  if is_local_domain "$DOMAIN"; then dom_label="${DOMAIN}  ${C_GREY}(self-signed TLS)${C_RESET}"; else dom_label="${DOMAIN}  ${C_GREY}(Let's Encrypt TLS)${C_RESET}"; fi
  if docker_ready; then docker_label="${C_GREEN}ready${C_RESET}"; else docker_label="${C_YEL}not running${C_RESET}"; fi

  printf '%b\n' "  ${C_CYAN}[*]${C_RESET} Product    : ${PRODUCT} — Container Streaming / VDI / DaaS"
  printf '%b\n' "  ${C_CYAN}[*]${C_RESET} Vendor     : ${VENDOR}"
  printf '%b\n' "  ${C_CYAN}[*]${C_RESET} System     : ${OS_NAME}  (${ARCH})"
  printf '%b\n' "  ${C_CYAN}[*]${C_RESET} Hardware   : ${CPU_CORES} vCPU · ${RAM_GB} GB RAM"
  printf '%b\n' "  ${C_CYAN}[*]${C_RESET} Docker     : ${docker_label}${DC:+  ${C_GREY}(${DC})${C_RESET}}"
  printf '%b\n' "  ${C_CYAN}[*]${C_RESET} Domain     : ${dom_label}"
  printf '%b\n' "  ${C_CYAN}[*]${C_RESET} Mode       : ${mode_label}"
  printf '%b\n' "  ${C_CYAN}[*]${C_RESET} Directory  : ${ASHA_DIR:-<not located>}"
  if [ "$(id -u)" -eq 0 ]; then
    printf '%b\n' "  ${C_CYAN}[*]${C_RESET} Privileges : ${C_GREEN}root${C_RESET}  [OK]"
  else
    printf '%b\n' "  ${C_CYAN}[*]${C_RESET} Privileges : user (sudo)"
  fi
}

show_credentials() {
  local admin_email admin_pw
  admin_email="admin@asha.local"
  admin_pw="$(get_env ASHA_SEED_ADMIN_PASSWORD)"; admin_pw="${admin_pw:-AshaAdmin!2026}"
  printf '\n'
  printf '%b\n' "  ${C_GOLDB}┌──────────────────────────────────────────────────────┐${C_RESET}"
  printf '%b\n' "  ${C_GOLDB}│${C_RESET}  ${C_WHITE}Asha is live${C_RESET}                                        ${C_GOLDB}│${C_RESET}"
  printf '%b\n' "  ${C_GOLDB}├──────────────────────────────────────────────────────┤${C_RESET}"
  printf '%b\n' "  ${C_GOLDB}│${C_RESET}  Open      : ${C_CYAN}https://${DOMAIN}${C_RESET}"
  printf '%b\n' "  ${C_GOLDB}│${C_RESET}  API docs  : ${C_CYAN}https://${DOMAIN}/api/docs${C_RESET}"
  printf '%b\n' "  ${C_GOLDB}│${C_RESET}  Email     : ${C_WHITE}${admin_email}${C_RESET}"
  printf '%b\n' "  ${C_GOLDB}│${C_RESET}  Password  : ${C_WHITE}${admin_pw}${C_RESET}"
  printf '%b\n' "  ${C_GOLDB}└──────────────────────────────────────────────────────┘${C_RESET}"
  printf '%b\n' "  ${C_GREY}Change the admin password after first sign-in (Settings → Security).${C_RESET}"
  printf '\n'
}

# ── High-level actions ───────────────────────────────────────────────────────
prompt_domain() {
  if [ -z "$DOMAIN" ]; then
    DOMAIN="$(ask 'Domain to serve Asha on (FQDN, or *.local for a local test)' "$DEFAULT_DOMAIN")"
  fi
  DOMAIN="$(printf '%s' "$DOMAIN" | tr '[:upper:]' '[:lower:]' | tr -d ' ')"
  [ -n "$DOMAIN" ] || DOMAIN="$DEFAULT_DOMAIN"
  if [ -z "$ACME_EMAIL" ]; then
    if is_local_domain "$DOMAIN"; then
      ACME_EMAIL="admin@${DOMAIN}"
    else
      ACME_EMAIL="$(ask 'Email for Let'\''s Encrypt / TLS notices' "admin@${DOMAIN}")"
    fi
  fi
}

action_install() {
  banner
  detect_os; detect_hardware; resolve_compose
  status_block
  printf '\n'
  prompt_domain
  require_privileges
  ensure_docker
  ensure_repo
  configure_env
  select_compose_files
  ensure_hosts_entry
  check_ports
  deploy
  wait_health || true
  rule
  show_credentials
  ok "Done. ${C_GREY}Manage with:${C_RESET} cd ${ASHA_DIR} && ${DC} ${COMPOSE_FILES[*]} ps"
}

action_status() {
  banner
  detect_os; detect_hardware; resolve_compose
  require_privileges
  ensure_repo
  : "${DOMAIN:=$(get_env ASHA_BASE_DOMAIN)}"; DOMAIN="${DOMAIN:-$DEFAULT_DOMAIN}"
  APP_MODE="$(get_env NEXT_PUBLIC_API_MODE)"; APP_MODE="${APP_MODE:-live}"
  select_compose_files
  status_block
  printf '\n'
  step "Containers"
  compose ps || true
}

action_uninstall() {
  banner
  require_privileges
  ensure_repo; resolve_compose
  : "${DOMAIN:=$(get_env ASHA_BASE_DOMAIN)}"; DOMAIN="${DOMAIN:-$DEFAULT_DOMAIN}"
  select_compose_files
  warn "This stops Asha and ${C_RED}deletes its database + Redis volumes${C_RESET}."
  if confirm "Remove Asha and all its data?"; then
    compose down -v --remove-orphans || true
    ok "Asha stopped and volumes removed. The source tree at ${ASHA_DIR} is kept."
  else
    info "Cancelled — nothing was removed."
  fi
}

action_update() {
  banner
  require_privileges
  ensure_repo; resolve_compose
  : "${DOMAIN:=$(get_env ASHA_BASE_DOMAIN)}"; DOMAIN="${DOMAIN:-$DEFAULT_DOMAIN}"
  APP_MODE="$(get_env NEXT_PUBLIC_API_MODE)"; APP_MODE="${APP_MODE:-live}"
  if [ -d "$ASHA_DIR/.git" ]; then
    step "Pulling latest source"
    ( cd "$ASHA_DIR" && $SUDO git pull --ff-only ) || warn "git pull failed — continuing with the current checkout."
  fi
  # Regenerate the prod override AFTER pulling, so it tracks the just-updated
  # base compose (the override's traefik command must mirror the base).
  select_compose_files
  deploy
  wait_health || true
  ok "Update complete."
}

action_lifecycle() {
  local what="$1"
  require_privileges; ensure_repo; resolve_compose
  : "${DOMAIN:=$(get_env ASHA_BASE_DOMAIN)}"; DOMAIN="${DOMAIN:-$DEFAULT_DOMAIN}"
  select_compose_files
  case "$what" in
    start)   compose up -d && ok "Started." ;;
    stop)    compose stop && ok "Stopped." ;;
    restart) compose restart && ok "Restarted." ;;
    logs)    compose logs -f --tail=120 ;;
  esac
}

usage() {
  cat <<EOF
${PRODUCT} installer · ${VENDOR} · v${SCRIPT_VERSION}

USAGE
  sudo bash scripts/install.sh [command] [options]

COMMANDS
  install            Full deploy (default when run interactively).
  status             Show stack status and container health.
  start|stop|restart Lifecycle control.
  logs               Tail container logs.
  update             git pull + rebuild + restart.
  uninstall          Stop Asha and remove its data volumes.
  menu               Force the interactive menu.
  help               This help.

OPTIONS
  --domain <fqdn>    Domain to serve Asha on (default: ${DEFAULT_DOMAIN}).
  --email <addr>     Email for Let's Encrypt / TLS notices.
  --mode <live|mock> Backend mode (default: live = active backend).
  --repo <url>       Git URL to clone when not run inside a checkout.
  -y, --yes          Non-interactive; accept defaults (required for CI).
  -h, --help         This help.

EXAMPLES
  sudo bash scripts/install.sh
  sudo bash scripts/install.sh --domain asha.example.com --email you@example.com --yes
  curl -fsSL ${DEFAULT_REPO%.git}/raw/main/scripts/install.sh | sudo bash
EOF
}

# ── Interactive menu (matches the branded banner) ────────────────────────────
menu() {
  while true; do
    banner
    detect_os; detect_hardware; resolve_compose
    : "${DOMAIN:=$(get_env ASHA_BASE_DOMAIN 2>/dev/null)}"; DOMAIN="${DOMAIN:-$DEFAULT_DOMAIN}"
    status_block
    printf '\n'
    rule
    printf '%b\n' "                               ${C_GOLDB}M E N U${C_RESET}"
    rule
    printf '%b\n' "    ${C_GOLD}[1]${C_RESET} Install Asha          ${C_GREY}(full deploy — recommended)${C_RESET}"
    printf '%b\n' "    ${C_GOLD}[2]${C_RESET} Configure domain & TLS ${C_GREY}(set FQDN + HTTPS, then deploy)${C_RESET}"
    printf '%b\n' "    ${C_GOLD}[3]${C_RESET} Check prerequisites    ${C_GREY}(Docker, Compose, ports)${C_RESET}"
    printf '%b\n' "    ${C_GOLD}[4]${C_RESET} Start / Stop / Restart ${C_GREY}(service lifecycle)${C_RESET}"
    printf '%b\n' "    ${C_GOLD}[5]${C_RESET} Status & logs          ${C_GREY}(docker compose ps / logs)${C_RESET}"
    printf '%b\n' "    ${C_GOLD}[6]${C_RESET} Show admin credentials"
    printf '%b\n' "    ${C_GOLD}[7]${C_RESET} Update                 ${C_GREY}(git pull + rebuild)${C_RESET}"
    printf '%b\n' "    ${C_GOLD}[8]${C_RESET} Uninstall              ${C_GREY}(stop + remove volumes)${C_RESET}"
    printf '%b\n' "    ${C_GOLD}[H]${C_RESET} Help / all commands"
    printf '%b\n' "    ${C_GOLD}[Q]${C_RESET} Quit"
    rule
    local choice; choice="$(ask 'Selection' '')"
    case "$(printf '%s' "$choice" | tr '[:upper:]' '[:lower:]')" in
      1) action_install ;;
      2) DOMAIN=""; ACME_EMAIL=""; prompt_domain; action_install ;;
      3) banner; detect_os; detect_hardware; require_privileges; ensure_docker; ensure_repo
         : "${DOMAIN:=$(get_env ASHA_BASE_DOMAIN)}"; DOMAIN="${DOMAIN:-$DEFAULT_DOMAIN}"; check_ports; ok "Prerequisites checked." ;;
      4) local lc; lc="$(ask 'start / stop / restart' 'restart')"; action_lifecycle "$lc" ;;
      5) action_status ;;
      6) ensure_repo; : "${DOMAIN:=$(get_env ASHA_BASE_DOMAIN)}"; DOMAIN="${DOMAIN:-$DEFAULT_DOMAIN}"; show_credentials ;;
      7) action_update ;;
      8) action_uninstall ;;
      h|help) usage ;;
      q|quit|exit|"") say "\n  ${C_GREY}— ${VENDOR} —${C_RESET}\n"; return 0 ;;
      *) warn "Unknown selection: ${choice}" ;;
    esac
    printf '\n'
    [ -r /dev/tty ] && { printf '%b' "  ${C_GREY}Press Enter to return to the menu…${C_RESET}"; IFS= read -r _ </dev/tty || true; } || return 0
  done
}

# ── Argument parsing ─────────────────────────────────────────────────────────
parse_args() {
  while [ "$#" -gt 0 ]; do
    case "$1" in
      install|menu|status|uninstall|update|help) ACTION="$1" ;;
      start|stop|restart|logs) ACTION="lifecycle"; LIFECYCLE_OP="$1" ;;
      --domain) shift; DOMAIN="${1:-}" ;;
      --domain=*) DOMAIN="${1#*=}" ;;
      --email) shift; ACME_EMAIL="${1:-}" ;;
      --email=*) ACME_EMAIL="${1#*=}" ;;
      --mode) shift; APP_MODE="${1:-live}" ;;
      --mode=*) APP_MODE="${1#*=}" ;;
      --repo) shift; ASHA_REPO="${1:-$DEFAULT_REPO}" ;;
      --repo=*) ASHA_REPO="${1#*=}" ;;
      -y|--yes) ASSUME_YES="true" ;;
      -h|--help) ACTION="help" ;;
      *) warn "Ignoring unknown argument: $1" ;;
    esac
    # `|| true`: a value-flag in last position already emptied $@ via its inner
    # shift, so this trailing shift must not abort under `set -e`.
    shift || true
  done
}

main() {
  setup_colors
  parse_args "$@"
  case "${APP_MODE}" in live|mock) : ;; *) APP_MODE="live" ;; esac

  case "$ACTION" in
    help)      usage ;;
    status)    action_status ;;
    uninstall) action_uninstall ;;
    update)    action_update ;;
    lifecycle) action_lifecycle "$LIFECYCLE_OP" ;;
    install)   action_install ;;
    menu)      menu ;;
    "")
      # No command: interactive → menu; non-interactive (or --yes) → install.
      if [ "$ASSUME_YES" = "true" ] || ! [ -r /dev/tty ]; then action_install; else menu; fi
      ;;
    *) usage ;;
  esac
}

# Run when executed directly OR streamed over stdin (curl | bash leaves
# BASH_SOURCE empty); skip only when sourced for tests (BASH_SOURCE set and
# differs from $0). The :- guards keep this safe under `set -u`.
if [ -z "${BASH_SOURCE[0]:-}" ] || [ "${BASH_SOURCE[0]:-}" = "${0}" ]; then
  main "$@"
fi
