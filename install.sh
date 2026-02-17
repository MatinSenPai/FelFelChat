#!/usr/bin/env bash
set -euo pipefail

# FelFel unified installer + manager
# One-liner:
#   curl -sL https://raw.githubusercontent.com/MatinSenPai/FelFelChat/main/install.sh | bash
#
# After install:
#   felfel

APP_NAME="FelFel Chat"
SCRIPT_VERSION="2026.02.18-5"
DEFAULT_SERVICE_NAME="felfelchat"
DEFAULT_REPO="${GITHUB_REPO:-MatinSenPai/FelFelChat}"
DEFAULT_REF="${GITHUB_REF:-main}"
CONFIG_DIR="${HOME}/.config/felfel"
CONFIG_FILE="${CONFIG_DIR}/config"

COLOR_CYAN="\033[36m"
COLOR_GREEN="\033[32m"
COLOR_YELLOW="\033[33m"
COLOR_RED="\033[31m"
COLOR_BOLD="\033[1m"
COLOR_RESET="\033[0m"

if [[ ! -t 1 ]]; then
  COLOR_CYAN=""
  COLOR_GREEN=""
  COLOR_YELLOW=""
  COLOR_RED=""
  COLOR_BOLD=""
  COLOR_RESET=""
fi

APP_DIR=""
SERVICE_NAME="$DEFAULT_SERVICE_NAME"
USE_SYSTEMD="1"
ENV_FILE=""
PID_FILE=""
LOG_DIR=""
OUT_LOG=""
ERR_LOG=""
BACKUP_DIR=""
DB_FILE=""
LAST_DEPLOY_FILE=""
LAST_BACKUP_FILE=""
INTERACTIVE="0"

log() { printf "%b[FelFel]%b %s\n" "$COLOR_CYAN" "$COLOR_RESET" "$1"; }
ok() { printf "%b[OK]%b %s\n" "$COLOR_GREEN" "$COLOR_RESET" "$1"; }
warn() { printf "%b[WARN]%b %s\n" "$COLOR_YELLOW" "$COLOR_RESET" "$1"; }
err() { printf "%b[ERROR]%b %s\n" "$COLOR_RED" "$COLOR_RESET" "$1" >&2; }

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    err "Missing command: $1"
    exit 1
  fi
}

detect_interactive() {
  if [[ "${FELFEL_AUTO:-0}" == "1" ]]; then
    INTERACTIVE="0"
    return
  fi
  if [[ -t 0 && -t 1 ]]; then
    INTERACTIVE="1"
  else
    INTERACTIVE="0"
  fi
}

prompt_with_default() {
  local label="$1"
  local default_value="$2"
  local answer=""
  if [[ "$INTERACTIVE" == "1" ]]; then
    read -r -p "${label} [${default_value}]: " answer
    echo "${answer:-$default_value}"
  else
    printf "%b[FelFel]%b %s\n" "$COLOR_CYAN" "$COLOR_RESET" "${label}: using default '${default_value}' (non-interactive mode)" >&2
    echo "$default_value"
  fi
}

as_root() {
  if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
    "$@"
    return
  fi
  if command -v sudo >/dev/null 2>&1; then
    sudo "$@"
    return
  fi
  err "Root access is required to install system packages. Run as root or install sudo."
  exit 1
}

run_pipe_to_root_bash() {
  local script_url="$1"
  if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
    curl -fL --retry 3 --retry-delay 2 --connect-timeout 20 "$script_url" | bash -
    return
  fi
  if command -v sudo >/dev/null 2>&1; then
    curl -fL --retry 3 --retry-delay 2 --connect-timeout 20 "$script_url" | sudo -E bash -
    return
  fi
  err "Root access is required to run bootstrap script: $script_url"
  exit 1
}

run_with_retries() {
  local attempts="$1"
  shift
  local i=1
  while (( i <= attempts )); do
    if "$@"; then
      return 0
    fi
    warn "Attempt ${i}/${attempts} failed: $*"
    sleep $((i * 2))
    i=$((i + 1))
  done
  return 1
}

detect_pkg_manager() {
  if command -v apt-get >/dev/null 2>&1; then echo "apt"; return; fi
  if command -v dnf >/dev/null 2>&1; then echo "dnf"; return; fi
  if command -v yum >/dev/null 2>&1; then echo "yum"; return; fi
  if command -v apk >/dev/null 2>&1; then echo "apk"; return; fi
  if command -v pacman >/dev/null 2>&1; then echo "pacman"; return; fi
  echo "unknown"
}

pkg_install() {
  local mgr="$1"
  shift
  case "$mgr" in
    apt)
      as_root env DEBIAN_FRONTEND=noninteractive apt-get update -y
      as_root env DEBIAN_FRONTEND=noninteractive apt-get install -y "$@"
      ;;
    dnf) as_root dnf install -y "$@" ;;
    yum) as_root yum install -y "$@" ;;
    apk) as_root apk add --no-cache "$@" ;;
    pacman) as_root pacman -Sy --noconfirm --needed "$@" ;;
    *)
      err "Unsupported package manager. Install these manually: $*"
      exit 1
      ;;
  esac
}

ensure_base_tools() {
  local mgr
  mgr="$(detect_pkg_manager)"

  if ! command -v git >/dev/null 2>&1; then
    log "Installing git..."
    case "$mgr" in
      apt|dnf|yum|apk|pacman) pkg_install "$mgr" git ;;
      *) err "git is required but package manager is unsupported."; exit 1 ;;
    esac
  fi

  if ! command -v curl >/dev/null 2>&1; then
    log "Installing curl..."
    case "$mgr" in
      apt|dnf|yum|apk|pacman) pkg_install "$mgr" curl ;;
      *) err "curl is required but package manager is unsupported."; exit 1 ;;
    esac
  fi

  if ! command -v openssl >/dev/null 2>&1; then
    log "Installing openssl..."
    case "$mgr" in
      apt|dnf|yum|apk|pacman) pkg_install "$mgr" openssl ;;
      *) warn "openssl not found; fallback random generator will be used." ;;
    esac
  fi

  # Ensure CA bundle exists for TLS endpoints (GitHub/registry).
  if [[ ! -f "/etc/ssl/certs/ca-certificates.crt" ]] && [[ ! -f "/etc/pki/tls/certs/ca-bundle.crt" ]]; then
    log "Installing CA certificates..."
    case "$mgr" in
      apt|dnf|yum|apk|pacman) pkg_install "$mgr" ca-certificates ;;
      *) warn "CA certificate bundle not found; TLS operations may fail." ;;
    esac
  fi
}

ensure_node_toolchain() {
  local mgr
  mgr="$(detect_pkg_manager)"
  local min_node_major current_node_major current_node_version
  min_node_major=20

  node_major() {
    local raw="${1:-v0.0.0}"
    raw="${raw#v}"
    echo "${raw%%.*}"
  }

  current_node_version="$(node -v 2>/dev/null || echo "v0.0.0")"
  current_node_major="$(node_major "$current_node_version")"

  if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1 && [[ "$current_node_major" -ge "$min_node_major" ]]; then
    return
  fi

  if command -v node >/dev/null 2>&1; then
    warn "Detected old Node.js ${current_node_version}. Upgrading to Node.js ${min_node_major}+..."
  else
    log "Installing Node.js + npm (detected package manager: ${mgr})..."
  fi

  case "$mgr" in
    apt)
      pkg_install "$mgr" ca-certificates gnupg
      log "Using NodeSource Node.js 20 for apt..."
      run_pipe_to_root_bash "https://deb.nodesource.com/setup_20.x"
      pkg_install "$mgr" nodejs
      ;;
    dnf|yum)
      log "Using NodeSource Node.js 20 for rpm..."
      run_pipe_to_root_bash "https://rpm.nodesource.com/setup_20.x"
      pkg_install "$mgr" nodejs
      ;;
    apk)
      pkg_install "$mgr" nodejs npm
      ;;
    pacman)
      pkg_install "$mgr" nodejs npm
      ;;
    *)
      err "Cannot auto-install Node.js/npm on this system."
      err "Please install Node.js 20+ and npm, then run installer again."
      exit 1
      ;;
  esac

  if ! command -v node >/dev/null 2>&1; then
    err "Node.js installation failed."
    exit 1
  fi
  if ! command -v npm >/dev/null 2>&1; then
    err "npm installation failed."
    err "Try running manually: apt/dnf/yum install npm (or rerun installer with internet access)."
    exit 1
  fi
  current_node_version="$(node -v 2>/dev/null || echo "v0.0.0")"
  current_node_major="$(node_major "$current_node_version")"
  if [[ "$current_node_major" -lt "$min_node_major" ]]; then
    err "Node.js ${min_node_major}+ is required, but found ${current_node_version}."
    err "Please install Node.js ${min_node_major}+ and rerun installer."
    exit 1
  fi
}

pause() {
  if [[ "$INTERACTIVE" == "1" ]]; then
    read -r -p "Press Enter to continue..."
  fi
}

line() {
  local width char
  width="${1:-62}"
  char="${2:--}"
  printf '%*s\n' "$width" '' | tr ' ' "$char"
}

status_badge() {
  case "$1" in
    RUNNING) printf "%bRUNNING%b" "$COLOR_GREEN" "$COLOR_RESET" ;;
    STOPPED) printf "%bSTOPPED%b" "$COLOR_RED" "$COLOR_RESET" ;;
    *) printf "%b%s%b" "$COLOR_YELLOW" "$1" "$COLOR_RESET" ;;
  esac
}

runtime_mode() {
  if has_systemd_service && [[ "$USE_SYSTEMD" == "1" ]]; then
    echo "systemd"
  else
    echo "fallback"
  fi
}

runtime_status() {
  if has_systemd_service && [[ "$USE_SYSTEMD" == "1" ]]; then
    if systemctl is-active --quiet "${SERVICE_NAME}.service"; then
      echo "RUNNING"
    else
      echo "STOPPED"
    fi
    return
  fi
  if is_running_fallback; then
    echo "RUNNING"
  else
    echo "STOPPED"
  fi
}

last_record_or_dash() {
  local file="$1"
  if [[ -f "$file" ]]; then
    cat "$file"
  else
    echo "-"
  fi
}

header() {
  if [[ -t 1 ]] && command -v clear >/dev/null 2>&1; then
    clear || true
  fi
  local mode status port origin
  mode="$(runtime_mode)"
  status="$(runtime_status)"
  port="$(load_env_value PORT)"; [[ -n "$port" ]] || port="-"
  origin="$(load_env_value APP_ORIGIN)"; [[ -n "$origin" ]] || origin="-"

  printf "%b" "$COLOR_CYAN"
  line 62 "="
  printf "%b%s%b\n" "$COLOR_BOLD" " FELFEL SERVER MANAGER " "$COLOR_RESET"
  line 62 "="
  printf "%b" "$COLOR_RESET"
  printf " App       : %s\n" "$APP_NAME"
  printf " Version   : %s\n" "$SCRIPT_VERSION"
  printf " Mode      : %s\n" "$mode"
  printf " Status    : %s\n" "$(status_badge "$status")"
  printf " Port      : %s\n" "$port"
  printf " Origin    : %s\n" "$origin"
  if [[ -n "$APP_DIR" ]]; then
    printf " App Dir   : %s\n" "$APP_DIR"
  fi
  printf " Last Deploy: %s\n" "$(last_record_or_dash "$LAST_DEPLOY_FILE")"
  printf " Last Backup: %s\n" "$(last_record_or_dash "$LAST_BACKUP_FILE")"
  printf "\n"
}

random_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  else
    head -c 32 /dev/urandom | xxd -p -c 256
  fi
}

set_paths() {
  ENV_FILE="${APP_DIR}/.env"
  PID_FILE="${APP_DIR}/.felfelchat.pid"
  LOG_DIR="${APP_DIR}/logs"
  OUT_LOG="${LOG_DIR}/server.out.log"
  ERR_LOG="${LOG_DIR}/server.err.log"
  BACKUP_DIR="${APP_DIR}/backups"
  DB_FILE="${APP_DIR}/prisma/dev.db"
  LAST_DEPLOY_FILE="${APP_DIR}/.felfel.last-deploy"
  LAST_BACKUP_FILE="${APP_DIR}/.felfel.last-backup"
}

save_config() {
  mkdir -p "$CONFIG_DIR"
  cat >"$CONFIG_FILE" <<EOF
APP_DIR=${APP_DIR}
SERVICE_NAME=${SERVICE_NAME}
USE_SYSTEMD=${USE_SYSTEMD}
EOF
}

load_config() {
  if [[ -f "$CONFIG_FILE" ]]; then
    # shellcheck disable=SC1090
    source "$CONFIG_FILE"
  fi
}

load_env_value() {
  local key="$1"
  if [[ -f "$ENV_FILE" ]]; then
    grep -E "^${key}=" "$ENV_FILE" | tail -n1 | cut -d= -f2- || true
  fi
}

upsert_env() {
  local key="$1"
  local value="$2"
  touch "$ENV_FILE"
  if grep -qE "^${key}=" "$ENV_FILE"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
  else
    echo "${key}=${value}" >> "$ENV_FILE"
  fi
}

default_install_dir() {
  if [[ -w "/opt" ]]; then
    echo "/opt/felfelchat"
  else
    echo "${HOME}/felfelchat"
  fi
}

has_systemd_service() {
  command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files | grep -q "^${SERVICE_NAME}\.service"
}

is_running_fallback() {
  [[ -f "$PID_FILE" ]] || return 1
  local pid
  pid="$(cat "$PID_FILE" 2>/dev/null || true)"
  [[ -n "$pid" ]] || return 1
  kill -0 "$pid" >/dev/null 2>&1
}

clone_or_update_repo() {
  ensure_base_tools
  local repo="$1" ref="$2"
  local primary_url fallback_url tar_url
  primary_url="${FELFEL_REPO_URL:-https://github.com/${repo}.git}"
  fallback_url="https://ghproxy.com/https://github.com/${repo}.git"
  tar_url="${FELFEL_TARBALL_URL:-https://codeload.github.com/${repo}/tar.gz/refs/heads/${ref}}"
  mkdir -p "$(dirname "$APP_DIR")"

  export GIT_HTTP_VERSION=HTTP/1.1
  export GIT_HTTP_LOW_SPEED_LIMIT=1000
  export GIT_HTTP_LOW_SPEED_TIME=30

  if [[ -d "$APP_DIR/.git" ]]; then
    log "Updating existing repository..."
    run_with_retries 3 git -C "$APP_DIR" fetch --all --tags || {
      warn "Primary fetch failed. Trying remote fallback mirror..."
      git -C "$APP_DIR" remote set-url origin "$fallback_url" || true
      run_with_retries 3 git -C "$APP_DIR" fetch --all --tags || {
        err "Could not update repository from network."
        exit 1
      }
    }
    git -C "$APP_DIR" checkout "$ref" || true
    run_with_retries 3 git -C "$APP_DIR" pull --ff-only || true
  else
    log "Downloading source snapshot..."
    rm -rf "$APP_DIR"
    mkdir -p "$APP_DIR"
    if run_with_retries 3 curl -4 -fL --retry 3 --retry-delay 2 --connect-timeout 20 "$tar_url" -o /tmp/felfel-src.tgz; then
      tar -xzf /tmp/felfel-src.tgz --strip-components=1 -C "$APP_DIR"
      rm -f /tmp/felfel-src.tgz
      ok "Source downloaded from tarball"
      return
    fi
    warn "Tarball download failed. Trying git clone..."
    if run_with_retries 3 git clone --config http.version=HTTP/1.1 --branch "$ref" --depth 1 "$primary_url" "$APP_DIR"; then
      return
    fi
    warn "Primary clone failed. Trying mirror clone..."
    if run_with_retries 3 git clone --config http.version=HTTP/1.1 --branch "$ref" --depth 1 "$fallback_url" "$APP_DIR"; then
      return
    fi
    warn "Mirror clone failed. Trying mirror tarball fallback..."
    rm -rf "$APP_DIR"
    mkdir -p "$APP_DIR"
    if run_with_retries 3 curl -4 -fL --retry 3 --retry-delay 2 --connect-timeout 20 "https://ghproxy.com/${tar_url}" -o /tmp/felfel-src.tgz; then
      tar -xzf /tmp/felfel-src.tgz --strip-components=1 -C "$APP_DIR"
      rm -f /tmp/felfel-src.tgz
      ok "Source downloaded from mirror tarball fallback"
      return
    fi
    err "Unable to download source code from GitHub/mirror/tarball."
    err "Set FELFEL_REPO_URL to a reachable git mirror and retry."
    exit 1
  fi
}

setup_env_interactive() {
  header
  local default_port default_origin port origin jwt_secret backup_signing_key sentry_dsn

  default_port="$(load_env_value PORT)"
  [[ -n "$default_port" ]] || default_port="3000"
  default_origin="$(load_env_value APP_ORIGIN)"
  [[ -n "$default_origin" ]] || default_origin="http://localhost:${default_port}"

  port="$(prompt_with_default "Port" "$default_port")"
  origin="$(prompt_with_default "Public app origin" "$default_origin")"

  jwt_secret="$(load_env_value JWT_SECRET)"
  if [[ -z "$jwt_secret" ]]; then
    jwt_secret="$(random_secret)"
  fi

  backup_signing_key="$(load_env_value BACKUP_SIGNING_KEY)"
  if [[ -z "$backup_signing_key" ]]; then
    backup_signing_key="$(random_secret)"
  fi

  sentry_dsn="$(load_env_value SENTRY_DSN)"

  upsert_env "NODE_ENV" "production"
  upsert_env "PORT" "$port"
  upsert_env "APP_ORIGIN" "$origin"
  upsert_env "JWT_SECRET" "$jwt_secret"
  upsert_env "BACKUP_SIGNING_KEY" "$backup_signing_key"
  upsert_env "DATABASE_URL" "\"file:./dev.db\""
  upsert_env "UPLOAD_DIR" "./uploads"
  upsert_env "UPLOAD_MAX_SIZE_MB" "5"
  upsert_env "BACKUP_DIR" "./backups"
  upsert_env "AUDIT_LOG_DIR" "./logs"
  upsert_env "SENTRY_DSN" "${sentry_dsn:-}"
  upsert_env "SENTRY_TRACES_SAMPLE_RATE" "0.1"

  mkdir -p "$LOG_DIR" "$BACKUP_DIR" "${APP_DIR}/uploads"
  ok ".env configured"
}

install_dependencies() {
  ensure_node_toolchain
  log "Installing dependencies..."
  (cd "$APP_DIR" && npm ci)
  ok "Dependencies installed"
}

run_migrations() {
  ensure_node_toolchain
  log "Running Prisma migrations..."
  if command -v npx >/dev/null 2>&1; then
    (cd "$APP_DIR" && npx prisma migrate deploy)
  else
    (cd "$APP_DIR" && npm exec -- prisma migrate deploy)
  fi
  ok "Migrations complete"
}

build_app() {
  ensure_node_toolchain
  log "Building application..."
  (cd "$APP_DIR" && npm run build)
  ok "Build complete"
}

install_systemd_service() {
  command -v systemctl >/dev/null 2>&1 || { warn "systemd not found, fallback mode enabled."; USE_SYSTEMD="0"; return; }
  [[ "$USE_SYSTEMD" == "1" ]] || return

  local service_file="/etc/systemd/system/${SERVICE_NAME}.service"
  local unit_tmp="/tmp/${SERVICE_NAME}.service"
  local user_name
  user_name="$(id -un)"

  cat >"$unit_tmp" <<EOF
[Unit]
Description=FelFel Chat
After=network.target

[Service]
Type=simple
User=${user_name}
WorkingDirectory=${APP_DIR}
EnvironmentFile=${ENV_FILE}
ExecStart=/usr/bin/env bash -lc 'cd ${APP_DIR} && npm run start'
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

  log "Installing systemd service ${SERVICE_NAME}..."
  if [[ -w "/etc/systemd/system" ]]; then
    mv "$unit_tmp" "$service_file"
    systemctl daemon-reload
    systemctl enable --now "${SERVICE_NAME}.service"
  elif command -v sudo >/dev/null 2>&1; then
    sudo mv "$unit_tmp" "$service_file"
    sudo systemctl daemon-reload
    sudo systemctl enable --now "${SERVICE_NAME}.service"
  else
    warn "No permission for systemd install. Using fallback mode."
    USE_SYSTEMD="0"
  fi
}

start_server() {
  ensure_node_toolchain
  if has_systemd_service && [[ "$USE_SYSTEMD" == "1" ]]; then
    if command -v sudo >/dev/null 2>&1; then sudo systemctl start "${SERVICE_NAME}.service"; else systemctl start "${SERVICE_NAME}.service"; fi
    ok "Service started via systemd"
    return
  fi

  if is_running_fallback; then
    warn "Server already running (PID $(cat "$PID_FILE"))"
    return
  fi
  mkdir -p "$LOG_DIR"
  (cd "$APP_DIR" && nohup env NODE_ENV=production node server.mjs >>"$OUT_LOG" 2>>"$ERR_LOG" & echo $! > "$PID_FILE")
  sleep 1
  if is_running_fallback; then
    ok "Server started (PID $(cat "$PID_FILE"))"
  else
    err "Failed to start fallback server"
  fi
}

stop_server() {
  if has_systemd_service && [[ "$USE_SYSTEMD" == "1" ]]; then
    if command -v sudo >/dev/null 2>&1; then sudo systemctl stop "${SERVICE_NAME}.service"; else systemctl stop "${SERVICE_NAME}.service"; fi
    ok "Service stopped via systemd"
    return
  fi

  if ! is_running_fallback; then
    warn "Server is not running"
    rm -f "$PID_FILE"
    return
  fi

  local pid
  pid="$(cat "$PID_FILE")"
  kill "$pid" || true
  sleep 1
  if kill -0 "$pid" >/dev/null 2>&1; then kill -9 "$pid" || true; fi
  rm -f "$PID_FILE"
  ok "Server stopped"
}

restart_server() {
  stop_server
  start_server
}

show_status() {
  header
  local mode status
  mode="$(runtime_mode)"
  status="$(runtime_status)"
  echo "Overview"
  line 62 "-"
  echo "Mode      : $mode"
  echo "Status    : $(status_badge "$status")"
  if has_systemd_service && [[ "$USE_SYSTEMD" == "1" ]]; then
    echo "Service   : ${SERVICE_NAME}.service"
  else
    if is_running_fallback; then
      echo "PID       : $(cat "$PID_FILE")"
    else
      echo "PID       : -"
    fi
  fi
  echo "Port      : $(load_env_value PORT)"
  echo "Origin    : $(load_env_value APP_ORIGIN)"
  echo "Health URL: $(load_env_value APP_ORIGIN)/api/health"
  echo "Ready URL : $(load_env_value APP_ORIGIN)/api/ready"
  echo "Path      : $APP_DIR"
  line 62 "-"
  pause
}

tail_logs() {
  header
  if has_systemd_service && [[ "$USE_SYSTEMD" == "1" ]]; then
    echo "Streaming systemd logs. Ctrl+C to return."
    if command -v sudo >/dev/null 2>&1; then sudo journalctl -u "${SERVICE_NAME}.service" -f; else journalctl -u "${SERVICE_NAME}.service" -f; fi
    return
  fi
  mkdir -p "$LOG_DIR"
  touch "$OUT_LOG" "$ERR_LOG"
  echo "Streaming fallback logs. Ctrl+C to return."
  tail -f "$OUT_LOG" "$ERR_LOG"
}

health_check() {
  header
  ensure_base_tools
  local port health_url ready_url
  port="$(load_env_value PORT)"
  [[ -n "$port" ]] || port="3000"
  health_url="http://127.0.0.1:${port}/api/health"
  ready_url="http://127.0.0.1:${port}/api/ready"
  local health_code ready_code
  health_code="$(curl -s -o /tmp/felfel-health.out -w "%{http_code}" "$health_url" || true)"
  ready_code="$(curl -s -o /tmp/felfel-ready.out -w "%{http_code}" "$ready_url" || true)"
  echo "Health endpoint: $health_url"
  echo "HTTP code      : ${health_code:-n/a}"
  cat /tmp/felfel-health.out 2>/dev/null || true
  echo; echo
  echo "Ready endpoint : $ready_url"
  echo "HTTP code      : ${ready_code:-n/a}"
  cat /tmp/felfel-ready.out 2>/dev/null || true
  rm -f /tmp/felfel-health.out /tmp/felfel-ready.out
  echo
  pause
}

update_repo() {
  ensure_base_tools
  log "Updating source code..."
  (cd "$APP_DIR" && git fetch --all --tags && git pull --ff-only)
  ok "Repository updated"
}

create_backup_manual() {
  header
  mkdir -p "$BACKUP_DIR"
  if [[ ! -f "$DB_FILE" ]]; then
    err "Database file not found: $DB_FILE"
    pause
    return
  fi
  local ts file
  ts="$(date +%Y%m%d-%H%M%S)"
  file="$BACKUP_DIR/manual-${ts}.sqlite"
  cp "$DB_FILE" "$file"
  printf "%s\n" "$(date '+%Y-%m-%d %H:%M:%S')" >"$LAST_BACKUP_FILE"
  ok "Manual backup created: $file"
  pause
}

restore_backup_manual() {
  header
  mapfile -t backups < <(find "$BACKUP_DIR" -maxdepth 1 -type f -name "*.sqlite" -printf "%f\n" 2>/dev/null | sort -r)
  if [[ ${#backups[@]} -eq 0 ]]; then
    warn "No backups found in $BACKUP_DIR"
    pause
    return
  fi

  echo "Available backups:"
  local i
  for i in "${!backups[@]}"; do printf "  %d) %s\n" "$((i + 1))" "${backups[$i]}"; done
  echo
  read -r -p "Choose backup number: " choice
  if ! [[ "$choice" =~ ^[0-9]+$ ]] || (( choice < 1 || choice > ${#backups[@]} )); then
    warn "Invalid selection"
    pause
    return
  fi
  local selected="$BACKUP_DIR/${backups[$((choice - 1))]}"
  read -r -p "Type YES to overwrite current DB: " confirm
  if [[ "$confirm" != "YES" ]]; then
    warn "Cancelled"
    pause
    return
  fi
  stop_server
  cp "$selected" "$DB_FILE"
  ok "Backup restored: $selected"
  read -r -p "Start server now? [Y/n]: " ans
  if [[ "${ans:-Y}" =~ ^[Yy]$ ]]; then start_server; fi
  pause
}

change_port_origin() {
  header
  local old_port old_origin new_port new_origin
  old_port="$(load_env_value PORT)"; [[ -n "$old_port" ]] || old_port="3000"
  old_origin="$(load_env_value APP_ORIGIN)"; [[ -n "$old_origin" ]] || old_origin="http://localhost:${old_port}"

  read -r -p "New port [${old_port}]: " new_port
  new_port="${new_port:-$old_port}"
  read -r -p "New app origin [${old_origin}]: " new_origin
  new_origin="${new_origin:-$old_origin}"

  upsert_env "PORT" "$new_port"
  upsert_env "APP_ORIGIN" "$new_origin"
  ok "Port/origin updated"
  read -r -p "Restart server now? [Y/n]: " ans
  if [[ "${ans:-Y}" =~ ^[Yy]$ ]]; then restart_server; fi
  pause
}

run_setup_wizard() {
  setup_env_interactive
  read -r -p "Install deps, migrate, build and restart now? [Y/n]: " ans
  if [[ "${ans:-Y}" =~ ^[Yy]$ ]]; then
    install_dependencies
    run_migrations
    build_app
    restart_server
  fi
  pause
}

full_deploy() {
  header
  update_repo
  install_dependencies
  run_migrations
  build_app
  restart_server
  printf "%s\n" "$(date '+%Y-%m-%d %H:%M:%S')" >"$LAST_DEPLOY_FILE"
  ok "Full deploy completed"
  pause
}

install_launcher() {
  local launcher target
  launcher="#!/usr/bin/env bash
exec \"${APP_DIR}/install.sh\" tui \"\$@\""

  if [[ -w "/usr/local/bin" ]]; then
    target="/usr/local/bin/felfel"
    printf "%s\n" "$launcher" >"$target"
    chmod +x "$target"
    ok "Installed launcher: $target"
    return
  fi

  if command -v sudo >/dev/null 2>&1; then
    target="/usr/local/bin/felfel"
    printf "%s\n" "$launcher" | sudo tee "$target" >/dev/null
    sudo chmod +x "$target"
    ok "Installed launcher: $target"
    return
  fi

  mkdir -p "${HOME}/.local/bin"
  target="${HOME}/.local/bin/felfel"
  printf "%s\n" "$launcher" >"$target"
  chmod +x "$target"
  ok "Installed launcher: $target"
  if [[ ":$PATH:" != *":${HOME}/.local/bin:"* ]]; then
    warn "~/.local/bin is not in PATH. Add it to your shell profile."
  fi
}

remove_launcher() {
  local removed="0"
  if [[ -f "/usr/local/bin/felfel" ]]; then
    if [[ -w "/usr/local/bin/felfel" ]]; then
      rm -f "/usr/local/bin/felfel"
    else
      as_root rm -f "/usr/local/bin/felfel"
    fi
    removed="1"
    ok "Removed launcher: /usr/local/bin/felfel"
  fi
  if [[ -f "${HOME}/.local/bin/felfel" ]]; then
    rm -f "${HOME}/.local/bin/felfel"
    removed="1"
    ok "Removed launcher: ${HOME}/.local/bin/felfel"
  fi
  if [[ "$removed" == "0" ]]; then
    warn "No felfel launcher found"
  fi
}

uninstall_app() {
  header
  echo "Uninstall ${APP_NAME}"
  line 62 "-"
  echo "This will remove service/launcher/config and optionally app files."
  echo

  local confirm keep_files
  if [[ "$INTERACTIVE" == "1" ]]; then
    read -r -p "Type UNINSTALL to continue: " confirm
    if [[ "$confirm" != "UNINSTALL" ]]; then
      warn "Cancelled"
      pause
      return
    fi
    read -r -p "Keep app directory (${APP_DIR})? [Y/n]: " keep_files
  else
    if [[ "${FELFEL_FORCE_UNINSTALL:-0}" != "1" ]]; then
      err "Non-interactive uninstall requires FELFEL_FORCE_UNINSTALL=1"
      exit 1
    fi
    keep_files="n"
  fi

  if has_systemd_service; then
    if command -v systemctl >/dev/null 2>&1; then
      if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
        systemctl stop "${SERVICE_NAME}.service" >/dev/null 2>&1 || true
        systemctl disable "${SERVICE_NAME}.service" >/dev/null 2>&1 || true
      else
        sudo systemctl stop "${SERVICE_NAME}.service" >/dev/null 2>&1 || true
        sudo systemctl disable "${SERVICE_NAME}.service" >/dev/null 2>&1 || true
      fi
    fi
    if [[ -f "/etc/systemd/system/${SERVICE_NAME}.service" ]]; then
      as_root rm -f "/etc/systemd/system/${SERVICE_NAME}.service"
      as_root systemctl daemon-reload || true
      ok "Removed systemd service: ${SERVICE_NAME}.service"
    fi
  fi

  if [[ -f "$PID_FILE" ]] && is_running_fallback; then
    stop_server || true
  fi

  remove_launcher

  if [[ -f "$CONFIG_FILE" ]]; then
    rm -f "$CONFIG_FILE"
    ok "Removed config: $CONFIG_FILE"
  fi

  if [[ -d "$CONFIG_DIR" ]] && [[ -z "$(ls -A "$CONFIG_DIR" 2>/dev/null)" ]]; then
    rmdir "$CONFIG_DIR" 2>/dev/null || true
  fi

  if [[ "${keep_files:-Y}" =~ ^[Nn]$ ]]; then
    if [[ -n "$APP_DIR" && "$APP_DIR" != "/" && -d "$APP_DIR" ]]; then
      rm -rf "$APP_DIR"
      ok "Removed app directory: $APP_DIR"
    else
      warn "Skipped app directory removal (unsafe path or not found)"
    fi
  else
    warn "Kept app directory: $APP_DIR"
  fi

  ok "Uninstall completed"
  if [[ "$INTERACTIVE" == "1" ]]; then
    pause
  fi
}

bootstrap_interactive() {
  header
  need_cmd bash
  detect_interactive
  ensure_base_tools
  ensure_node_toolchain

  local install_dir repo ref use_systemd default_dir default_port default_origin
  default_dir="$(default_install_dir)"
  default_port="3000"
  default_origin="http://localhost:${default_port}"

  echo "Welcome to ${APP_NAME} one-shot installer"
  echo
  install_dir="$(prompt_with_default "Install directory" "$default_dir")"
  APP_DIR="$install_dir"
  set_paths

  repo="$(prompt_with_default "Repository" "$DEFAULT_REPO")"
  ref="$(prompt_with_default "Branch/Ref" "$DEFAULT_REF")"
  if [[ "$INTERACTIVE" == "1" ]]; then
    read -r -p "Use systemd service if available? [Y/n]: " use_systemd
    if [[ "${use_systemd:-Y}" =~ ^[Nn]$ ]]; then USE_SYSTEMD="0"; else USE_SYSTEMD="1"; fi
  else
    USE_SYSTEMD="1"
    log "Use systemd service if available: yes (non-interactive mode)"
  fi

  clone_or_update_repo "$repo" "$ref"
  set_paths
  setup_env_interactive
  install_dependencies
  run_migrations
  build_app
  install_systemd_service
  start_server
  install_launcher
  printf "%s\n" "$(date '+%Y-%m-%d %H:%M:%S')" >"$LAST_DEPLOY_FILE"
  save_config

  ok "Installation finished."
  echo "Run: felfel"
  if [[ "$INTERACTIVE" == "1" ]]; then
    read -r -p "Open TUI manager now? [Y/n]: " open_now
  else
    open_now="n"
    log "Open TUI manager now: no (non-interactive mode)"
  fi
  if [[ "${open_now:-Y}" =~ ^[Yy]$ ]]; then
    "${APP_DIR}/install.sh" tui
  fi
}

ensure_app_dir_for_tui() {
  load_config
  if [[ -z "${APP_DIR:-}" ]]; then
    local script_dir
    script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    if [[ -f "${script_dir}/package.json" && -f "${script_dir}/server.mjs" ]]; then
      APP_DIR="$script_dir"
      set_paths
      return
    fi
    err "No installation config found. Run installer first."
    exit 1
  fi
  set_paths
}

menu() {
  while true; do
    header
    cat <<EOF
$(printf "%b" "$COLOR_BOLD")Runtime$(printf "%b" "$COLOR_RESET")
  1) Status dashboard
  2) Start server
  3) Stop server
  4) Restart server
  5) Live logs
  6) Health/Readiness check

$(printf "%b" "$COLOR_BOLD")Deploy$(printf "%b" "$COLOR_RESET")
  7) Full deploy (pull + install + migrate + build + restart)
  8) Update source code only
  9) Setup wizard (.env/secrets/port/origin)
 10) Change port/origin

$(printf "%b" "$COLOR_BOLD")Backup$(printf "%b" "$COLOR_RESET")
 11) Create manual DB backup
 12) Restore manual DB backup

$(printf "%b" "$COLOR_BOLD")Tools$(printf "%b" "$COLOR_RESET")
 13) Install/repair 'felfel' launcher
 14) Uninstall FelFel
  0) Exit
EOF
    echo
    read -r -p "Select an action: " choice
    case "$choice" in
      1) show_status ;;
      2) header; start_server; pause ;;
      3) header; stop_server; pause ;;
      4) header; restart_server; pause ;;
      5) tail_logs ;;
      6) health_check ;;
      7) full_deploy ;;
      8) header; update_repo; pause ;;
      9) run_setup_wizard ;;
      10) change_port_origin ;;
      11) create_backup_manual ;;
      12) restore_backup_manual ;;
      13) header; install_launcher; pause ;;
      14) uninstall_app ;;
      0) exit 0 ;;
      *) warn "Invalid option"; pause ;;
    esac
  done
}

main() {
  detect_interactive
  local mode="${1:-install}"
  case "$mode" in
    install) bootstrap_interactive ;;
    tui) ensure_app_dir_for_tui; menu ;;
    uninstall) ensure_app_dir_for_tui; uninstall_app ;;
    *)
      err "Unknown mode: $mode"
      err "Use: install.sh (install) or install.sh tui or install.sh uninstall"
      exit 1
      ;;
  esac
}

main "$@"
