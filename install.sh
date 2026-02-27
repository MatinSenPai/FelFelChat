#!/usr/bin/env bash
set -euo pipefail

# FelFel unified installer + manager
# One-liner:
#   curl -sL https://raw.githubusercontent.com/MatinSenPai/FelFelChat/main/install.sh | bash
#
# After install:
#   felfel

APP_NAME="FelFel Chat"
SCRIPT_VERSION="2026.02.26-15"
DEFAULT_SERVICE_NAME="felfelchat"
DEFAULT_REPO="${GIT_REPO_URL:-${GITHUB_REPO:-https://github.com/MatinSenPai/FelFelChat}}"
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

# ------------------------------------------------------------------
# Remove broken/stale MongoDB apt repo files that return 403.
# On geo-restricted networks (e.g. Iranian VPS), a leftover
# /etc/apt/sources.list.d/mongodb-org-*.list from a previous
# install attempt will cause ALL apt-get update calls to fail.
# This function proactively cleans them up if they are unreachable.
# ------------------------------------------------------------------
_cleanup_broken_apt_repos() {
  local mongo_lists
  mongo_lists=(/etc/apt/sources.list.d/mongodb-org-*.list /etc/apt/sources.list.d/mongodb-enterprise-*.list)
  local found_any="0"
  for f in "${mongo_lists[@]}"; do
    [[ -f "$f" ]] && found_any="1" && break
  done
  [[ "$found_any" == "1" ]] || return 0

  # Quick connectivity test: try fetching the InRelease from the repo
  # If it returns 403/Forbidden, remove the offending source file.
  for f in "${mongo_lists[@]}"; do
    [[ -f "$f" ]] || continue
    local repo_url
    repo_url="$(grep -oP 'https?://[^ ]+' "$f" 2>/dev/null | head -1 || true)"
    if [[ -n "$repo_url" ]]; then
      local http_code
      http_code="$(curl -sL -o /dev/null -w '%{http_code}' --max-time 10 --connect-timeout 5 "${repo_url}/InRelease" 2>/dev/null || echo "000")"
      if [[ "$http_code" == "403" || "$http_code" == "000" ]]; then
        warn "Removing blocked MongoDB apt repo: $f (HTTP ${http_code})"
        as_root rm -f "$f"
        # Also clean from sources.list
        if [[ -f /etc/apt/sources.list ]]; then
          as_root sed -i '/repo\.mongodb\.org\/apt\/.*mongodb-org\//d; /repo\.mongodb\.org\/apt\/.*mongodb-enterprise\//d' /etc/apt/sources.list 2>/dev/null || true
        fi
      fi
    fi
  done
}

pkg_install() {
  local mgr="$1"
  shift
  case "$mgr" in
    apt)
      # Clean up any stale MongoDB apt repos that return 403 (geo-blocked)
      # to prevent them from breaking all future apt operations.
      _cleanup_broken_apt_repos
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
      # Ubuntu/Debian often has legacy Node 12 split packages that conflict with NodeSource nodejs.
      as_root env DEBIAN_FRONTEND=noninteractive apt-get remove -y libnode-dev nodejs-doc >/dev/null 2>&1 || true
      as_root env DEBIAN_FRONTEND=noninteractive apt-get purge -y libnode-dev nodejs-doc >/dev/null 2>&1 || true
      as_root env DEBIAN_FRONTEND=noninteractive apt-get -f install -y >/dev/null 2>&1 || true
      log "Using NodeSource Node.js 20 for apt..."
      run_pipe_to_root_bash "https://deb.nodesource.com/setup_20.x"
      pkg_install "$mgr" nodejs || {
        warn "First Node.js install attempt failed; trying apt repair and retry..."
        as_root env DEBIAN_FRONTEND=noninteractive apt-get -f install -y || true
        as_root env DEBIAN_FRONTEND=noninteractive apt-get remove -y libnode-dev nodejs-doc || true
        as_root env DEBIAN_FRONTEND=noninteractive apt-get purge -y libnode-dev nodejs-doc || true
        as_root env DEBIAN_FRONTEND=noninteractive apt-get -f install -y || true
        pkg_install "$mgr" nodejs
      }
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

ensure_mongodb_packages() {
  local mgr series key_series distro codename component repo_file keyring repo_line pgp_tmp pgp_downloaded
  mgr="$(detect_pkg_manager)"
  series="${FELFEL_MONGODB_SERIES:-}"

  # Allow skipping automatic MongoDB install (useful on restricted networks).
  # Set FELFEL_MONGODB_SKIP_INSTALL=1 if MongoDB is already installed.
  if [[ "${FELFEL_MONGODB_SKIP_INSTALL:-0}" == "1" ]]; then
    log "Skipping MongoDB package install (FELFEL_MONGODB_SKIP_INSTALL=1)"
    return 0
  fi

  case "$mgr" in
    apt)
      pkg_install "$mgr" ca-certificates curl gnupg
      distro="$(. /etc/os-release && echo "${ID:-ubuntu}")"
      if [[ "$distro" != "ubuntu" && "$distro" != "debian" ]]; then
        if . /etc/os-release && [[ "${ID_LIKE:-}" == *"ubuntu"* ]]; then
          distro="ubuntu"
        elif . /etc/os-release && [[ "${ID_LIKE:-}" == *"debian"* ]]; then
          distro="debian"
        else
          distro="ubuntu"
        fi
      fi
      codename="$(. /etc/os-release && echo "${VERSION_CODENAME:-}")"
      if [[ -z "$codename" ]]; then
        codename="$(. /etc/os-release && echo "${UBUNTU_CODENAME:-}")"
      fi
      if [[ -z "$codename" ]]; then
        codename="$(lsb_release -sc 2>/dev/null || echo "jammy")"
      fi
      [[ -n "$series" ]] || series="8.0"
      component="main"
      [[ "$distro" != "ubuntu" ]] || component="multiverse"

      # ----------------------------------------------------------------
      # FELFEL_MONGODB_MIRROR : custom apt mirror base URL
      #   e.g. http://mirror.example.com/mongodb
      #   Mirror must serve same directory structure as repo.mongodb.org/apt/
      # FELFEL_MONGODB_PGP_MIRROR : base URL serving .asc PGP key files
      #   e.g. http://mirror.example.com/pgp
      # ----------------------------------------------------------------
      local mongo_apt_mirror="${FELFEL_MONGODB_MIRROR:-}"

      key_series=""
      keyring=""
      pgp_tmp="/tmp/felfel-mongodb-server.asc"
      as_root rm -f /etc/apt/sources.list.d/mongodb-org-*.list \
                    /etc/apt/sources.list.d/mongodb-enterprise-*.list 2>/dev/null || true
      if [[ -f /etc/apt/sources.list ]]; then
        as_root sed -i \
          '/repo\.mongodb\.org\/apt\/.*mongodb-org\//d
           /repo\.mongodb\.org\/apt\/.*mongodb-enterprise\//d' \
          /etc/apt/sources.list || true
      fi

      # Step 1: Download MongoDB PGP signing key.
      # On geo-restricted networks (e.g. Iran), the official MongoDB CDN
      # (pgp.mongodb.com / fastdl.mongodb.org) may return 403.
      # We try: official CDN -> mongodb.org static -> custom mirror ->
      #         Ubuntu keyserver (hkp usually unblocked by network firewalls).
      pgp_downloaded="0"
      local pgp_mirror_base="${FELFEL_MONGODB_PGP_MIRROR:-}"

      for key_series in "$series" "8.0"; do
        [[ -n "$key_series" ]] || continue
        local pgp_urls=()
        pgp_urls+=("https://pgp.mongodb.com/server-${key_series}.asc")
        pgp_urls+=("https://www.mongodb.org/static/pgp/server-${key_series}.asc")
        [[ -z "$pgp_mirror_base" ]] || pgp_urls+=("${pgp_mirror_base}/server-${key_series}.asc")

        for pgp_url in "${pgp_urls[@]}"; do
          log "Trying MongoDB PGP key: ${pgp_url}"
          if curl -fsSL --max-time 30 --retry 2 "${pgp_url}" -o "$pgp_tmp" 2>/dev/null \
             && grep -q "BEGIN PGP" "$pgp_tmp" 2>/dev/null; then
            pgp_downloaded="1"; break
          fi
          rm -f "$pgp_tmp"
        done
        [[ "$pgp_downloaded" == "1" ]] && break

        # Fallback: Ubuntu keyserver (usually reachable when CDN is geo-blocked)
        log "CDN blocked. Trying Ubuntu keyserver for MongoDB ${key_series} key..."
        local mongo_key_ids=(
          "B00A0BD1E2C63C11"
          "20691EEC35216C63"
          "E162F504A20CDF15"
          "99DB70FAE1D7CE227FB6488206B2552E"
        )
        for key_id in "${mongo_key_ids[@]}"; do
          rm -f /tmp/felfel-mongo-tmp.gpg /tmp/felfel-mongo-tmp.gpg~ 2>/dev/null || true
          if gpg --no-default-keyring \
               --keyring /tmp/felfel-mongo-tmp.gpg \
               --keyserver hkp://keyserver.ubuntu.com \
               --recv-keys "$key_id" 2>/dev/null; then
            gpg --no-default-keyring \
              --keyring /tmp/felfel-mongo-tmp.gpg \
              --export --armor "$key_id" > "$pgp_tmp" 2>/dev/null || true
            rm -f /tmp/felfel-mongo-tmp.gpg /tmp/felfel-mongo-tmp.gpg~ 2>/dev/null || true
            if [[ -s "$pgp_tmp" ]]; then
              pgp_downloaded="1"; break
            fi
          fi
        done
        [[ "$pgp_downloaded" == "1" ]] && break
      done

      if [[ "$pgp_downloaded" != "1" ]]; then
        warn "Could not download MongoDB PGP key from any source."
        warn "Trying direct binary tarball install as final fallback..."
        if _install_mongodb_deb_direct "$series" "$codename" "$distro"; then
          return 0
        fi
        err "MongoDB installation failed. Try one of the following env vars:"
        err "  FELFEL_MONGODB_PGP_MIRROR=<url>  – mirror serving server-X.Y.asc files"
        err "  FELFEL_MONGODB_MIRROR=<url>       – apt mirror base URL"
        err "  FELFEL_MONGODB_DEB_MIRROR=<url>   – binary tarball mirror"
        err "  FELFEL_MONGODB_SKIP_INSTALL=1     – skip (if MongoDB already installed)"
        exit 1
      fi

      keyring="/usr/share/keyrings/mongodb-server-${key_series}.gpg"
      as_root gpg --dearmor -o "$keyring" "$pgp_tmp"
      rm -f "$pgp_tmp"

      # Step 2: Add apt repo and install packages.
      repo_file="/etc/apt/sources.list.d/mongodb-org-${series}.list"
      local apt_base_url="https://repo.mongodb.org/apt/${distro}"
      if [[ -n "$mongo_apt_mirror" ]]; then
        apt_base_url="${mongo_apt_mirror}/${distro}"
        log "Using custom MongoDB apt mirror: ${apt_base_url}"
      fi
      repo_line="deb [ arch=amd64,arm64 signed-by=${keyring} ] ${apt_base_url} ${codename}/mongodb-org/${series} ${component}"
      log "Mongo apt target: distro=${distro} codename=${codename} series=${series} key=${key_series}"
      printf "%s\n" "$repo_line" | as_root tee "$repo_file" >/dev/null

      # Capture update output to detect 403 geo-block
      as_root apt-get update -y > /tmp/felfel-apt-upd.log 2>&1 || true
      if grep -q "403\|Forbidden\|Failed to fetch.*mongodb" /tmp/felfel-apt-upd.log 2>/dev/null; then
        rm -f /tmp/felfel-apt-upd.log
        warn "MongoDB apt repo is blocked (HTTP 403 / Forbidden)."
        warn "Trying direct binary tarball install..."
        as_root rm -f "$repo_file"
        if _install_mongodb_deb_direct "$series" "$codename" "$distro"; then
          return 0
        fi
        err "Both apt repo and direct binary install failed."
        err "  Set FELFEL_MONGODB_MIRROR=<local-mirror> and rerun, or"
        err "  install MongoDB manually and set FELFEL_MONGODB_SKIP_INSTALL=1."
        exit 1
      fi
      rm -f /tmp/felfel-apt-upd.log

      if ! as_root env DEBIAN_FRONTEND=noninteractive apt-get install -y \
           mongodb-org mongodb-mongosh mongodb-database-tools; then
        warn "Full mongodb-org install failed. Trying minimal set..."
        as_root env DEBIAN_FRONTEND=noninteractive apt-get install -y mongodb-org || {
          warn "mongodb-org apt install failed. Trying binary tarball fallback..."
          as_root rm -f "$repo_file"
          _install_mongodb_deb_direct "$series" "$codename" "$distro" || exit 1
          return 0
        }
        as_root env DEBIAN_FRONTEND=noninteractive apt-get install -y \
          mongodb-mongosh mongodb-database-tools || true
      fi
      ;;
    dnf|yum)
      local mongo_rpm_mirror="${FELFEL_MONGODB_MIRROR:-}"
      local gpg_key_url="https://pgp.mongodb.com/server-${series}.asc"
      [[ -z "${FELFEL_MONGODB_PGP_MIRROR:-}" ]] || \
        gpg_key_url="${FELFEL_MONGODB_PGP_MIRROR}/server-${series}.asc"
      local rpm_baseurl="https://repo.mongodb.org/yum/redhat/\$releasever/mongodb-org/${series}/x86_64/"
      if [[ -n "$mongo_rpm_mirror" ]]; then
        rpm_baseurl="${mongo_rpm_mirror}/yum/redhat/\$releasever/mongodb-org/${series}/x86_64/"
        log "Using custom MongoDB rpm mirror: ${mongo_rpm_mirror}"
      fi
      repo_file="/etc/yum.repos.d/mongodb-org-${series}.repo"
      as_root bash -lc "cat > '$repo_file' <<'RPMEOF'
[mongodb-org-${series}]
name=MongoDB Repository
baseurl=${rpm_baseurl}
gpgcheck=1
enabled=1
gpgkey=${gpg_key_url}
RPMEOF"
      if [[ "$mgr" == "dnf" ]]; then
        as_root dnf install -y mongodb-org mongodb-mongosh mongodb-database-tools
      else
        as_root yum install -y mongodb-org mongodb-mongosh mongodb-database-tools
      fi
      ;;
    *)
      err "Automatic MongoDB install is supported on apt/dnf/yum only."
      err "Install mongod and mongosh manually, set FELFEL_MONGODB_SKIP_INSTALL=1, then rerun."
      exit 1
      ;;
  esac
}

# ------------------------------------------------------------------
# _install_mongodb_deb_direct: install MongoDB from a prebuilt binary
# tarball when the official apt/yum repository is inaccessible.
#
# Downloads from fastdl.mongodb.org (different CDN than repo.mongodb.org)
# or from FELFEL_MONGODB_DEB_MIRROR.
#
# Env vars (all optional):
#   FELFEL_MONGODB_DEB_MIRROR  – base URL serving MongoDB tarball files
#                                 (default: https://fastdl.mongodb.org)
#   FELFEL_MONGODB_VERSION      – exact version, e.g. "8.0.5"
# ------------------------------------------------------------------
_install_mongodb_deb_direct() {
  local series="${1:-8.0}"
  local codename="${2:-jammy}"
  local _distro="${3:-ubuntu}"

  local deb_mirror="${FELFEL_MONGODB_DEB_MIRROR:-}"
  local version="${FELFEL_MONGODB_VERSION:-}"

  local default_version
  case "$series" in
    "8.0"|"8.2") default_version="8.0.5"  ;;
    "7.0")       default_version="7.0.15" ;;
    "6.0")       default_version="6.0.19" ;;
    *)           default_version="8.0.5"  ;;
  esac
  [[ -n "$version" ]] || version="$default_version"

  local arch
  arch="$(dpkg --print-architecture 2>/dev/null || echo "amd64")"

  local os_string
  case "$codename" in
    noble)    os_string="ubuntu2404" ;;
    jammy)    os_string="ubuntu2204" ;;
    focal)    os_string="ubuntu2004" ;;
    bionic)   os_string="ubuntu1804" ;;
    bookworm) os_string="debian12"   ;;
    bullseye) os_string="debian11"   ;;
    buster)   os_string="debian10"   ;;
    *)        os_string="ubuntu2204" ;;
  esac

  log "Attempting direct binary tarball: MongoDB ${version} for ${os_string}/${arch}..."

  local base_dl="${deb_mirror:-https://fastdl.mongodb.org}"
  local tgz_url="${base_dl}/linux/mongodb-linux-${arch}-${os_string}-${version}.tgz"
  local tgz_path="/tmp/felfel-mongo.tgz"
  local extract_dir="/tmp/felfel-mongo-extract"

  if ! curl -fL --max-time 180 --retry 3 --retry-delay 5 --connect-timeout 30 \
       "$tgz_url" -o "$tgz_path" 2>/dev/null; then
    err "Binary tarball download failed: ${tgz_url}"
    return 1
  fi

  rm -rf "$extract_dir"; mkdir -p "$extract_dir"
  if ! tar -xzf "$tgz_path" --strip-components=1 -C "$extract_dir" 2>/dev/null; then
    err "Failed to extract MongoDB tarball."; rm -f "$tgz_path"; return 1
  fi
  rm -f "$tgz_path"

  for bin in mongod mongos; do
    [[ -f "${extract_dir}/bin/${bin}" ]] || continue
    as_root cp "${extract_dir}/bin/${bin}" /usr/local/bin/
    as_root chmod +x "/usr/local/bin/${bin}"
  done
  rm -rf "$extract_dir"

  # Try to get mongosh separately
  if ! command -v mongosh >/dev/null 2>&1; then
    local mongosh_base="${FELFEL_MONGODB_DEB_MIRROR:-https://downloads.mongodb.com}"
    local mongosh_url="${mongosh_base}/compass/mongosh-2.3.0-linux-${arch}.tgz"
    if curl -fL --max-time 120 --retry 2 --connect-timeout 30 \
         "$mongosh_url" -o /tmp/felfel-mongosh.tgz 2>/dev/null; then
      mkdir -p /tmp/felfel-mongosh-x
      tar -xzf /tmp/felfel-mongosh.tgz --strip-components=1 -C /tmp/felfel-mongosh-x 2>/dev/null || true
      if [[ -f "/tmp/felfel-mongosh-x/bin/mongosh" ]]; then
        as_root cp /tmp/felfel-mongosh-x/bin/mongosh /usr/local/bin/mongosh
        as_root chmod +x /usr/local/bin/mongosh
      fi
      rm -rf /tmp/felfel-mongosh.tgz /tmp/felfel-mongosh-x
    fi
  fi

  command -v mongod >/dev/null 2>&1 || { err "mongod not found after tarball install."; return 1; }
  ok "MongoDB installed from tarball: $(mongod --version 2>/dev/null | head -1 || echo 'ok')"

  # System setup: user, dirs, config, systemd unit
  id mongod >/dev/null 2>&1 || as_root useradd --system --no-create-home --shell /bin/false mongod 2>/dev/null || true
  as_root mkdir -p /var/lib/mongodb /var/log/mongodb /var/run/mongodb
  as_root chown -R mongod:mongod /var/lib/mongodb /var/log/mongodb /var/run/mongodb 2>/dev/null || true

  if [[ ! -f /etc/mongod.conf ]]; then
    cat > /tmp/felfel-mongod.conf <<'MONGOD_CONF'
storage:
  dbPath: /var/lib/mongodb
systemLog:
  destination: file
  logAppend: true
  path: /var/log/mongodb/mongod.log
net:
  port: 27017
  bindIp: 127.0.0.1
processManagement:
  pidFilePath: /var/run/mongodb/mongod.pid
  timeZoneInfo: /usr/share/zoneinfo
MONGOD_CONF
    as_root mv /tmp/felfel-mongod.conf /etc/mongod.conf
  fi

  if command -v systemctl >/dev/null 2>&1 && \
     ! systemctl list-unit-files 2>/dev/null | grep -q '^mongod\.service'; then
    cat > /tmp/felfel-mongod.service <<'MONGOD_UNIT'
[Unit]
Description=MongoDB Database Server
After=network.target

[Service]
User=mongod
Group=mongod
ExecStart=/usr/local/bin/mongod --config /etc/mongod.conf
ExecStartPre=/bin/mkdir -p /var/run/mongodb
ExecStartPre=+/bin/chown mongod:mongod /var/run/mongodb
LimitNOFILE=64000
TasksMax=32768
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
MONGOD_UNIT
    as_root mv /tmp/felfel-mongod.service /etc/systemd/system/mongod.service
    as_root systemctl daemon-reload 2>/dev/null || true
  fi
  return 0
}

ensure_mongodb_service_running() {
  local service_name
  service_name="mongod"
  if command -v systemctl >/dev/null 2>&1; then
    if systemctl list-unit-files | grep -q '^mongod\.service'; then
      service_name="mongod"
    elif systemctl list-unit-files | grep -q '^mongodb\.service'; then
      service_name="mongodb"
    fi
    as_root systemctl daemon-reload >/dev/null 2>&1 || true
    as_root systemctl enable --now "${service_name}.service" >/dev/null 2>&1 || as_root systemctl restart "${service_name}.service" >/dev/null 2>&1 || true
    return
  fi
  as_root service mongod start >/dev/null 2>&1 || as_root service mongodb start >/dev/null 2>&1 || true
}

wait_for_mongodb() {
  local attempts
  attempts=30
  while (( attempts > 0 )); do
    if command -v mongosh >/dev/null 2>&1 && mongosh --quiet --eval "db.adminCommand({ ping: 1 }).ok" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
    attempts=$((attempts - 1))
  done
  return 1
}

ensure_mongodb_replica_set() {
  local repl_set service_name conf_file host_value initiated attempts
  repl_set="${FELFEL_MONGODB_REPLICA_SET:-rs0}"
  conf_file="/etc/mongod.conf"
  if [[ -f "$conf_file" ]]; then
    if grep -Eq '^[[:space:]]*replication:[[:space:]]*$' "$conf_file"; then
      if grep -Eq '^[[:space:]]*replSetName:[[:space:]]*' "$conf_file"; then
        if ! grep -Eq "^[[:space:]]*replSetName:[[:space:]]*${repl_set}[[:space:]]*$" "$conf_file"; then
          if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
            sed -i -E "s|^([[:space:]]*replSetName:[[:space:]]*).*$|\\1${repl_set}|g" "$conf_file"
          else
            sudo sed -i -E "s|^([[:space:]]*replSetName:[[:space:]]*).*$|\\1${repl_set}|g" "$conf_file"
          fi
        fi
      else
        if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
          sed -i "/^[[:space:]]*replication:[[:space:]]*$/a\\  replSetName: ${repl_set}" "$conf_file"
        else
          sudo sed -i "/^[[:space:]]*replication:[[:space:]]*$/a\\  replSetName: ${repl_set}" "$conf_file"
        fi
      fi
    else
      if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
        printf "\nreplication:\n  replSetName: %s\n" "$repl_set" >>"$conf_file"
      else
        printf "\nreplication:\n  replSetName: %s\n" "$repl_set" | sudo tee -a "$conf_file" >/dev/null
      fi
    fi
  fi

  service_name="mongod"
  if command -v systemctl >/dev/null 2>&1; then
    if systemctl list-unit-files | grep -q '^mongod\.service'; then
      service_name="mongod"
    elif systemctl list-unit-files | grep -q '^mongodb\.service'; then
      service_name="mongodb"
    fi
    as_root systemctl restart "${service_name}.service" >/dev/null 2>&1 || true
  fi

  if ! wait_for_mongodb; then
    return 1
  fi

  initiated="0"
  if mongosh --quiet --eval "const s=rs.status(); if (s.ok===1) quit(0); quit(1);" >/dev/null 2>&1; then
    initiated="1"
  fi
  if [[ "$initiated" != "1" ]]; then
    host_value="$(mongosh --quiet --eval "const h=db.hello(); print(h.me || h.primary || '127.0.0.1:27017')" 2>/dev/null | tail -n1 | tr -d '\r')"
    if [[ -z "$host_value" ]]; then
      host_value="127.0.0.1:27017"
    fi
    mongosh --quiet --eval "rs.initiate({_id:'${repl_set}',members:[{_id:0,host:'${host_value}'}]})" >/dev/null 2>&1 || true
  fi

  attempts=45
  while (( attempts > 0 )); do
    if mongosh --quiet --eval "const s=rs.status(); if (s.ok===1 && (s.myState===1 || s.members.some(m => m.stateStr === 'PRIMARY'))) quit(0); quit(1);" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
    attempts=$((attempts - 1))
  done
  return 1
}

ensure_mongodb() {
  # Only require mongod and mongosh; mongodump/mongorestore are optional
  # (the binary tarball fallback on geo-blocked networks does not include them).
  if ! command -v mongod >/dev/null 2>&1 || ! command -v mongosh >/dev/null 2>&1; then
    log "Installing MongoDB server and tools..."
    ensure_mongodb_packages
  fi
  ensure_mongodb_service_running
  if ! ensure_mongodb_replica_set; then
    err "MongoDB replica set is not ready."
    err "Check with: mongosh --quiet --eval 'rs.status()'"
    exit 1
  fi
  if ! wait_for_mongodb; then
    err "MongoDB service is not ready."
    err "Check service logs with: journalctl -u mongod -n 200 --no-pager"
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
  if [[ "$(runtime_controller)" == "systemd" ]]; then
    echo "systemd"
  else
    echo "fallback"
  fi
}

runtime_controller() {
  if has_systemd_service; then
    if [[ "$USE_SYSTEMD" == "1" ]]; then
      echo "systemd"
      return
    fi
    if systemctl is-active --quiet "${SERVICE_NAME}.service" 2>/dev/null; then
      echo "systemd"
      return
    fi
    if systemctl is-enabled --quiet "${SERVICE_NAME}.service" 2>/dev/null; then
      echo "systemd"
      return
    fi
  fi
  echo "fallback"
}

runtime_status() {
  if [[ "$(runtime_controller)" == "systemd" ]]; then
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

strip_wrapping_quotes() {
  local value="$1"
  value="${value#\"}"
  value="${value%\"}"
  printf "%s" "$value"
}

resolve_database_url() {
  local db_url repl_set
  repl_set="${FELFEL_MONGODB_REPLICA_SET:-rs0}"
  db_url="$(strip_wrapping_quotes "$(load_env_value DATABASE_URL)")"
  db_url="${db_url//\\\"/\"}"
  db_url="$(strip_wrapping_quotes "$db_url")"
  db_url="$(printf "%s" "$db_url" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')"
  if [[ "$db_url" =~ ^mongo:// ]]; then
    db_url="mongodb://${db_url#mongo://}"
  fi
  if [[ -z "$db_url" ]] || [[ "$db_url" =~ ^file: ]]; then
    db_url="mongodb://127.0.0.1:27017/felfelchat?replicaSet=${repl_set}&directConnection=true"
  fi
  if [[ ! "$db_url" =~ ^mongodb(\+srv)?:// ]]; then
    db_url="mongodb://127.0.0.1:27017/felfelchat?replicaSet=${repl_set}&directConnection=true"
  fi
  if [[ "$db_url" =~ ^mongodb://(127\.0\.0\.1|localhost)(:[0-9]+)?/[^?]+$ ]]; then
    db_url="${db_url}?replicaSet=${repl_set}&directConnection=true"
  elif [[ "$db_url" =~ ^mongodb://(127\.0\.0\.1|localhost)(:[0-9]+)?/[^?]+\?.*$ ]]; then
    if [[ "$db_url" != *"replicaSet="* ]]; then
      db_url="${db_url}&replicaSet=${repl_set}"
    fi
    if [[ "$db_url" != *"directConnection="* ]]; then
      db_url="${db_url}&directConnection=true"
    fi
  fi
  printf "%s" "$db_url"
}

cleanup_legacy_sqlite_artifacts() {
  rm -f "${APP_DIR}/prisma/dev.db" "${APP_DIR}/prisma/dev.db-journal" "${APP_DIR}/dev.db" "${APP_DIR}/dev.db-journal" 2>/dev/null || true
  rm -rf "${APP_DIR}/prisma/migrations" 2>/dev/null || true
}

upsert_env() {
  local key="$1"
  local value="$2"
  local escaped_value
  escaped_value="$(printf "%s" "$value" | sed -e 's/[&|]/\\&/g')"
  touch "$ENV_FILE"
  if grep -qE "^${key}=" "$ENV_FILE"; then
    sed -i "s|^${key}=.*|${key}=${escaped_value}|" "$ENV_FILE"
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

default_runtime_user() {
  if [[ "${EUID:-$(id -u)}" -eq 0 ]] && [[ -n "${SUDO_USER:-}" ]]; then
    printf "%s" "$SUDO_USER"
    return
  fi
  id -un
}

detect_service_user() {
  local service_user=""
  if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files | grep -q "^${SERVICE_NAME}\.service"; then
    service_user="$(systemctl show -p User --value "${SERVICE_NAME}.service" 2>/dev/null || true)"
  fi
  if [[ -z "$service_user" ]]; then
    service_user="$(default_runtime_user)"
  fi
  printf "%s" "$service_user"
}

ensure_runtime_permissions() {
  local runtime_user
  runtime_user="$(detect_service_user)"
  mkdir -p "$LOG_DIR" "$BACKUP_DIR" "${APP_DIR}/uploads"

  if [[ -n "$runtime_user" ]]; then
    if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
      chown -R "${runtime_user}:${runtime_user}" "$LOG_DIR" "$BACKUP_DIR" "${APP_DIR}/uploads" 2>/dev/null || true
    elif command -v sudo >/dev/null 2>&1; then
      sudo chown -R "${runtime_user}:${runtime_user}" "$LOG_DIR" "$BACKUP_DIR" "${APP_DIR}/uploads" 2>/dev/null || true
    fi
  fi
}

build_artifacts_ready() {
  [[ -f "${APP_DIR}/.next/BUILD_ID" ]] && [[ -f "${APP_DIR}/.next/server/middleware-manifest.json" ]]
}

is_running_fallback() {
  [[ -f "$PID_FILE" ]] || return 1
  local pid
  pid="$(cat "$PID_FILE" 2>/dev/null || true)"
  [[ -n "$pid" ]] || return 1
  kill -0 "$pid" >/dev/null 2>&1
}

list_port_listener_pids() {
  local target_port="$1"
  if command -v ss >/dev/null 2>&1; then
    ss -ltnp "sport = :${target_port}" 2>/dev/null \
      | awk -F'pid=' 'NR>1 && NF>1 {split($2,a,","); gsub(/[^0-9]/,"",a[1]); if(a[1]!="") print a[1]}' \
      | sort -u
    return 0
  fi
  if command -v lsof >/dev/null 2>&1; then
    lsof -t -iTCP:"$target_port" -sTCP:LISTEN 2>/dev/null | sort -u
    return 0
  fi
  return 1
}

port_has_listener() {
  local target_port="$1"
  if command -v ss >/dev/null 2>&1; then
    ss -ltn "sport = :${target_port}" 2>/dev/null | awk 'NR>1 {found=1} END {exit found ? 0 : 1}'
    return $?
  fi
  if command -v lsof >/dev/null 2>&1; then
    lsof -iTCP:"$target_port" -sTCP:LISTEN >/dev/null 2>&1
    return $?
  fi
  if command -v netstat >/dev/null 2>&1; then
    netstat -ltn 2>/dev/null | awk -v port=":${target_port}" '$4 ~ port "$" {found=1} END {exit found ? 0 : 1}'
    return $?
  fi
  return 1
}

pid_cmdline_preview() {
  local pid="$1"
  if [[ -r "/proc/${pid}/cmdline" ]]; then
    tr '\0' ' ' <"/proc/${pid}/cmdline" 2>/dev/null | cut -c1-140
    return 0
  fi
  if command -v ps >/dev/null 2>&1; then
    ps -p "$pid" -o args= 2>/dev/null | cut -c1-140
    return 0
  fi
  return 1
}

pid_looks_like_app() {
  local pid="$1"
  local cmdline cwd
  cmdline="$(pid_cmdline_preview "$pid" || true)"
  cwd="$(readlink -f "/proc/${pid}/cwd" 2>/dev/null || true)"
  [[ "$cmdline" == *node* ]] || return 1
  if [[ -n "$cwd" && "$cwd" == "${APP_DIR}"* ]]; then
    return 0
  fi
  if [[ "$cmdline" == *"${APP_DIR}"* ]] || [[ "$cmdline" == *"server.mjs"* ]]; then
    return 0
  fi
  return 1
}

kill_pid_forcefully() {
  local pid="$1"
  kill "$pid" >/dev/null 2>&1 || { command -v sudo >/dev/null 2>&1 && sudo kill "$pid" >/dev/null 2>&1 || true; }
  sleep 1
  if kill -0 "$pid" >/dev/null 2>&1; then
    kill -9 "$pid" >/dev/null 2>&1 || { command -v sudo >/dev/null 2>&1 && sudo kill -9 "$pid" >/dev/null 2>&1 || true; }
  fi
}

ensure_port_available_for_app() {
  local target_port="$1"
  local service_pid pids remaining pid cmdline
  [[ -n "$target_port" ]] || return 0
  service_pid=""
  if has_systemd_service; then
    service_pid="$(systemctl show -p MainPID --value "${SERVICE_NAME}.service" 2>/dev/null || true)"
  fi

  mapfile -t pids < <(list_port_listener_pids "$target_port" || true)
  if [[ ${#pids[@]} -eq 0 ]]; then
    if port_has_listener "$target_port"; then
      err "Port ${target_port} is already in use, but the owner PID is not visible from this user."
      err "Run manager with the same runtime user (or with sudo), or change PORT in .env."
      return 1
    fi
    return 0
  fi

  for pid in "${pids[@]}"; do
    [[ -n "$pid" ]] || continue
    [[ "$pid" != "0" ]] || continue
    if [[ -n "$service_pid" && "$pid" == "$service_pid" ]]; then
      continue
    fi
    if pid_looks_like_app "$pid"; then
      if [[ ! -f "$PID_FILE" ]] || ! is_running_fallback; then
        printf "%s" "$pid" >"$PID_FILE"
      fi
      return 0
    fi
  done

  mapfile -t remaining < <(list_port_listener_pids "$target_port" || true)
  if [[ ${#remaining[@]} -eq 0 ]] && ! port_has_listener "$target_port"; then
    return 0
  fi

  local unresolved=()
  for pid in "${remaining[@]}"; do
    [[ -n "$pid" ]] || continue
    [[ "$pid" != "0" ]] || continue
    if [[ -n "$service_pid" && "$pid" == "$service_pid" ]]; then
      continue
    fi
    unresolved+=("$pid")
  done

  if [[ ${#unresolved[@]} -eq 0 ]]; then
    return 0
  fi

  err "Port ${target_port} is already in use by another process."
  for pid in "${unresolved[@]}"; do
    cmdline="$(pid_cmdline_preview "$pid" || echo "unknown")"
    err "PID ${pid}: ${cmdline}"
  done
  err "Stop conflicting process(es) or change PORT in .env before starting ${APP_NAME}."
  return 1
}

clone_or_update_repo() {
  ensure_base_tools
  local repo="$1" ref="$2"
  local primary_url fallback_url tar_url
  if [[ "$repo" =~ ^https?:// ]] || [[ "$repo" =~ ^git@ ]]; then
    primary_url="${FELFEL_REPO_URL:-$repo}"
    fallback_url=""
    tar_url="${FELFEL_TARBALL_URL:-}"
  else
    primary_url="${FELFEL_REPO_URL:-https://github.com/${repo}.git}"
    fallback_url="https://ghproxy.com/https://github.com/${repo}.git"
    tar_url="${FELFEL_TARBALL_URL:-https://codeload.github.com/${repo}/tar.gz/refs/heads/${ref}}"
  fi
  mkdir -p "$(dirname "$APP_DIR")"

  export GIT_HTTP_VERSION=HTTP/1.1
  export GIT_HTTP_LOW_SPEED_LIMIT=1000
  export GIT_HTTP_LOW_SPEED_TIME=30

  if [[ -d "$APP_DIR/.git" ]]; then
    git -C "$APP_DIR" config core.fileMode false >/dev/null 2>&1 || true
    log "Updating existing repository..."
    git -C "$APP_DIR" remote set-url origin "$primary_url" || true
    run_with_retries 3 git -C "$APP_DIR" fetch --all --tags || {
      if [[ -n "$fallback_url" ]]; then
        warn "Primary fetch failed. Trying remote fallback mirror..."
        git -C "$APP_DIR" remote set-url origin "$fallback_url" || true
        run_with_retries 3 git -C "$APP_DIR" fetch --all --tags || {
          err "Could not update repository from network."
          exit 1
        }
        git -C "$APP_DIR" remote set-url origin "$primary_url" || true
      else
        err "Could not update repository from network."
        exit 1
      fi
    }
    git -C "$APP_DIR" checkout "$ref" || true
    run_with_retries 3 git -C "$APP_DIR" pull --ff-only || true
  else
    rm -rf "$APP_DIR"
    if [[ -n "$tar_url" ]]; then
      log "Downloading source snapshot..."
      mkdir -p "$APP_DIR"
      if run_with_retries 3 curl -4 -fL --retry 3 --retry-delay 2 --connect-timeout 20 "$tar_url" -o /tmp/felfel-src.tgz; then
        tar -xzf /tmp/felfel-src.tgz --strip-components=1 -C "$APP_DIR"
        rm -f /tmp/felfel-src.tgz
        ok "Source downloaded from tarball"
        return
      fi
      warn "Tarball download failed. Trying git clone..."
      rm -rf "$APP_DIR"
    fi

    if run_with_retries 3 git clone --config http.version=HTTP/1.1 --branch "$ref" --depth 1 "$primary_url" "$APP_DIR"; then
      return
    fi
    if [[ -n "$fallback_url" ]]; then
      warn "Primary clone failed. Trying mirror clone..."
      if run_with_retries 3 git clone --config http.version=HTTP/1.1 --branch "$ref" --depth 1 "$fallback_url" "$APP_DIR"; then
        return
      fi
      if [[ -n "$tar_url" ]]; then
        warn "Mirror clone failed. Trying mirror tarball fallback..."
        rm -rf "$APP_DIR"
        mkdir -p "$APP_DIR"
        if run_with_retries 3 curl -4 -fL --retry 3 --retry-delay 2 --connect-timeout 20 "https://ghproxy.com/${tar_url}" -o /tmp/felfel-src.tgz; then
          tar -xzf /tmp/felfel-src.tgz --strip-components=1 -C "$APP_DIR"
          rm -f /tmp/felfel-src.tgz
          ok "Source downloaded from mirror tarball fallback"
          return
        fi
      fi
    fi
    err "Unable to download source code from configured repository."
    err "Set FELFEL_REPO_URL to a reachable git URL and retry."
    exit 1
  fi
  git -C "$APP_DIR" config core.fileMode false >/dev/null 2>&1 || true
}

setup_env_interactive() {
  header
  local default_port default_origin default_database_url port origin jwt_secret backup_signing_key sentry_dsn webrtc_turn_urls webrtc_turn_username webrtc_turn_credential turn_domain
  ensure_mongodb

  default_port="$(load_env_value PORT)"
  [[ -n "$default_port" ]] || default_port="3000"
  default_origin="$(load_env_value APP_ORIGIN)"
  [[ -n "$default_origin" ]] || default_origin="http://felfel.example.com"
  default_database_url="$(resolve_database_url)"

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
  webrtc_turn_urls="$(load_env_value NEXT_PUBLIC_WEBRTC_TURN_URLS)"
  webrtc_turn_username="$(load_env_value NEXT_PUBLIC_WEBRTC_TURN_USERNAME)"
  webrtc_turn_credential="$(load_env_value NEXT_PUBLIC_WEBRTC_TURN_CREDENTIAL)"
  if [[ -z "$webrtc_turn_urls" ]]; then
    webrtc_turn_urls="${FELFEL_WEBRTC_TURN_URLS:-}"
  fi
  if [[ -z "$webrtc_turn_username" ]]; then
    webrtc_turn_username="${FELFEL_WEBRTC_TURN_USERNAME:-}"
  fi
  if [[ -z "$webrtc_turn_credential" ]]; then
    webrtc_turn_credential="${FELFEL_WEBRTC_TURN_CREDENTIAL:-}"
  fi
  turn_domain="$(extract_domain_from_origin "$origin")"
  if [[ -n "$turn_domain" ]]; then
    webrtc_turn_urls="$(build_turn_urls_for_domain "$turn_domain")"
  fi
  if [[ "$INTERACTIVE" == "1" ]]; then
    webrtc_turn_username="$(prompt_with_default "WebRTC TURN username" "${webrtc_turn_username:-}")"
    webrtc_turn_credential="$(prompt_with_default "WebRTC TURN credential" "${webrtc_turn_credential:-}")"
  fi
  if [[ -n "$turn_domain" && -n "$webrtc_turn_username" && -n "$webrtc_turn_credential" ]]; then
    if command -v turnadmin >/dev/null 2>&1; then
      if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
        turnadmin -a -u "$webrtc_turn_username" -r "$turn_domain" -p "$webrtc_turn_credential" >/dev/null 2>&1 || warn "Failed to create TURN user with turnadmin"
      elif command -v sudo >/dev/null 2>&1; then
        sudo turnadmin -a -u "$webrtc_turn_username" -r "$turn_domain" -p "$webrtc_turn_credential" >/dev/null 2>&1 || warn "Failed to create TURN user with turnadmin"
      else
        warn "turnadmin found but sudo/root not available; TURN user was not created"
      fi
    fi
  fi

  upsert_env "NODE_ENV" "production"
  upsert_env "PORT" "$port"
  upsert_env "APP_ORIGIN" "$origin"
  upsert_env "JWT_SECRET" "$jwt_secret"
  upsert_env "BACKUP_SIGNING_KEY" "$backup_signing_key"
  upsert_env "DATABASE_URL" "$default_database_url"
  upsert_env "UPLOAD_DIR" "./uploads"
  upsert_env "UPLOAD_MAX_SIZE_MB" "5"
  upsert_env "BACKUP_DIR" "./backups"
  upsert_env "AUDIT_LOG_DIR" "./logs"
  upsert_env "SENTRY_DSN" "${sentry_dsn:-}"
  upsert_env "SENTRY_TRACES_SAMPLE_RATE" "0.1"
  upsert_env "NEXT_PUBLIC_WEBRTC_TURN_URLS" "${webrtc_turn_urls:-}"
  upsert_env "NEXT_PUBLIC_WEBRTC_TURN_USERNAME" "${webrtc_turn_username:-}"
  upsert_env "NEXT_PUBLIC_WEBRTC_TURN_CREDENTIAL" "${webrtc_turn_credential:-}"

  mkdir -p "$LOG_DIR" "$BACKUP_DIR" "${APP_DIR}/uploads"
  ensure_runtime_permissions
  ok ".env configured"
}

# ------------------------------------------------------------------
# ensure_swap: On low-RAM servers (< 2GB), npm ci and Next.js build
# will be killed by the OOM killer. This creates a temporary swap
# file to provide the needed headroom.
# ------------------------------------------------------------------
ensure_swap() {
  # Only on Linux
  [[ -f /proc/meminfo ]] || return 0

  local total_ram_kb swap_total_kb
  total_ram_kb="$(awk '/^MemTotal:/ {print $2}' /proc/meminfo)"
  swap_total_kb="$(awk '/^SwapTotal:/ {print $2}' /proc/meminfo)"

  # If total RAM + existing swap >= 2GB, no action needed
  local total_available=$(( (total_ram_kb + swap_total_kb) / 1024 ))
  if (( total_available >= 2048 )); then
    return 0
  fi

  log "Low memory detected (${total_ram_kb}KB RAM, ${swap_total_kb}KB swap). Creating swap..."
  local swap_file="/swapfile"
  if [[ -f "$swap_file" ]] && swapon --show | grep -q "$swap_file"; then
    log "Swap file already active."
    return 0
  fi

  # Create 2GB swap file
  as_root dd if=/dev/zero of="$swap_file" bs=1M count=2048 status=progress 2>/dev/null || \
    as_root fallocate -l 2G "$swap_file" 2>/dev/null || {
      warn "Could not create swap file. npm ci may fail on low-RAM servers."
      return 0
    }
  as_root chmod 600 "$swap_file"
  as_root mkswap "$swap_file" >/dev/null 2>&1
  as_root swapon "$swap_file" 2>/dev/null || {
    warn "Could not activate swap. npm ci may fail on low-RAM servers."
    return 0
  }
  ok "Swap file created and activated (2GB)"
}

install_dependencies() {
  ensure_node_toolchain
  ensure_swap
  log "Installing dependencies..."
  (cd "$APP_DIR" && NODE_OPTIONS="--max-old-space-size=768" npm ci)
  ok "Dependencies installed"
}

run_migrations() {
  ensure_node_toolchain
  ensure_mongodb
  upsert_env "DATABASE_URL" "$(resolve_database_url)"
  cleanup_legacy_sqlite_artifacts
  ensure_runtime_permissions
  log "Syncing Prisma schema..."
  if command -v npx >/dev/null 2>&1; then
    (cd "$APP_DIR" && npx prisma db push --accept-data-loss && npx prisma generate)
  else
    (cd "$APP_DIR" && npm exec -- prisma db push --accept-data-loss && npm exec -- prisma generate)
  fi
  ensure_runtime_permissions
  ok "Database sync complete"
}

build_app() {
  ensure_node_toolchain
  ensure_swap
  log "Building application..."
  (cd "$APP_DIR" && NODE_OPTIONS="--max-old-space-size=768" npm run build)
  ok "Build complete"
}

install_systemd_service() {
  command -v systemctl >/dev/null 2>&1 || { warn "systemd not found, fallback mode enabled."; USE_SYSTEMD="0"; return; }
  [[ "$USE_SYSTEMD" == "1" ]] || return

  local service_file="/etc/systemd/system/${SERVICE_NAME}.service"
  local unit_tmp="/tmp/${SERVICE_NAME}.service"
  local user_name
  user_name="$(default_runtime_user)"

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
  ensure_runtime_permissions
  local port
  port="$(load_env_value PORT)"
  [[ -n "$port" ]] || port="3000"

  # Stop any running instances first (prevents orphaned processes accumulating)
  if [[ "$(runtime_controller)" != "systemd" ]]; then
    stop_server 2>/dev/null || true
  fi

  ensure_port_available_for_app "$port" || return 1
  if ! build_artifacts_ready; then
    warn "Build artifacts missing (.next). Running build..."
    build_app
  fi
  if [[ "$(runtime_controller)" == "systemd" ]]; then
    if command -v sudo >/dev/null 2>&1; then sudo systemctl start "${SERVICE_NAME}.service"; else systemctl start "${SERVICE_NAME}.service"; fi
    ok "Service started via systemd"
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
  if [[ "$(runtime_controller)" == "systemd" ]]; then
    if command -v sudo >/dev/null 2>&1; then sudo systemctl stop "${SERVICE_NAME}.service"; else systemctl stop "${SERVICE_NAME}.service"; fi
    ok "Service stopped via systemd"
    return
  fi

  # Kill the tracked PID if present
  if [[ -f "$PID_FILE" ]]; then
    local pid
    pid="$(cat "$PID_FILE" 2>/dev/null || true)"
    if [[ -n "$pid" ]]; then
      kill "$pid" 2>/dev/null || true
      sleep 1
      kill -0 "$pid" >/dev/null 2>&1 && kill -9 "$pid" 2>/dev/null || true
    fi
    rm -f "$PID_FILE"
  fi

  # Also kill any orphaned app processes not tracked by the PID file
  # (caused by multiple nohup starts without proper stop)
  local orphan_pids
  mapfile -t orphan_pids < <(
    pgrep -f "node server\.mjs" 2>/dev/null | grep -v "^$$" || true
    pgrep -f "npm run start" 2>/dev/null | grep -v "^$$" || true
  )
  if [[ ${#orphan_pids[@]} -gt 0 ]]; then
    warn "Killing ${#orphan_pids[@]} orphaned app process(es)..."
    for p in "${orphan_pids[@]}"; do
      [[ -n "$p" ]] || continue
      kill "$p" 2>/dev/null || true
    done
    sleep 1
    for p in "${orphan_pids[@]}"; do
      [[ -n "$p" ]] || continue
      kill -0 "$p" >/dev/null 2>&1 && kill -9 "$p" 2>/dev/null || true
    done
  fi

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
  if [[ "$mode" == "systemd" ]]; then
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
  if [[ "$(runtime_controller)" == "systemd" ]]; then
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
  (cd "$APP_DIR" && git config core.fileMode false >/dev/null 2>&1 || true)
  local dirty_files
  dirty_files="$(cd "$APP_DIR" && git diff --name-only)"
  if [[ "$dirty_files" == "install.sh" ]]; then
    if (cd "$APP_DIR" && git diff --summary -- install.sh | grep -q "mode change"); then
      warn "Detected mode-only local change on install.sh; resetting it before pull."
      (cd "$APP_DIR" && git checkout -- install.sh)
    fi
  fi
  log "Updating source code..."
  (cd "$APP_DIR" && git fetch --all --tags && git pull --ff-only)
  ok "Repository updated"
}

create_backup_manual() {
  header
  ensure_mongodb
  mkdir -p "$BACKUP_DIR"
  local ts file db_url
  db_url="$(resolve_database_url)"
  ts="$(date +%Y%m%d-%H%M%S)"
  file="$BACKUP_DIR/manual-${ts}.archive.gz"
  if ! mongodump --uri="$db_url" --archive="$file" --gzip >/dev/null 2>&1; then
    err "Manual backup failed. Ensure MongoDB tools are installed and DATABASE_URL is valid."
    pause
    return
  fi
  printf "%s\n" "$(date '+%Y-%m-%d %H:%M:%S')" >"$LAST_BACKUP_FILE"
  ok "Manual backup created: $file"
  pause
}

restore_backup_manual() {
  header
  ensure_mongodb
  local db_url
  db_url="$(resolve_database_url)"
  mapfile -t backups < <(find "$BACKUP_DIR" -maxdepth 1 -type f -name "*.archive.gz" -printf "%f\n" 2>/dev/null | sort -r)
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
  if ! mongorestore --uri="$db_url" --archive="$selected" --gzip --drop >/dev/null 2>&1; then
    err "Restore failed. The backup may be invalid or MongoDB is unavailable."
    pause
    return
  fi
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
  read -r -p "Install deps, sync DB, build and restart now? [Y/n]: " ans
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
exec /usr/bin/env bash \"${APP_DIR}/install.sh\" tui \"\$@\""

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

superadmin_change_credentials() {
  header
  echo "Change Superadmin Credentials"
  line 62 "-"
  echo "This updates the superadmin account directly in MongoDB."
  echo

  if ! command -v mongosh >/dev/null 2>&1; then
    err "mongosh not found. Cannot update credentials."
    if [[ "$INTERACTIVE" == "1" ]]; then pause; fi
    return 1
  fi

  local db_url db_name
  db_url="$(load_env_value DATABASE_URL 2>/dev/null || true)"
  if [[ -z "$db_url" ]]; then
    db_url="$(grep -E '^DATABASE_URL=' "${APP_DIR}/.env" 2>/dev/null | cut -d= -f2- | tr -d '"' || true)"
  fi
  db_name="$(printf '%s' "$db_url" | sed -E 's|.*//[^/]+/([^?]+).*|\1|' || echo 'felfelchat')"
  db_name="${db_name:-felfelchat}"

  # Find the superadmin user
  local sa_username
  sa_username="$(mongosh --quiet "$db_url" --eval \
    'const u = db.User.findOne({isSuperAdmin:true}); print(u ? u.username : "")' 2>/dev/null || true)"

  if [[ -z "$sa_username" ]]; then
    err "No superadmin user found in database: ${db_name}"
    err "Check that the app was installed and the database seeded."
    if [[ "$INTERACTIVE" == "1" ]]; then pause; fi
    return 1
  fi

  ok "Found superadmin: ${sa_username}"
  echo

  local new_username new_password confirm_password new_displayname
  read -r -p "New username (leave blank to keep '${sa_username}'): " new_username
  read -r -p "New display name (leave blank to skip): " new_displayname
  read -r -s -p "New password (leave blank to skip): " new_password; echo
  if [[ -n "$new_password" ]]; then
    if [[ ${#new_password} -lt 8 ]]; then
      err "Password must be at least 8 characters."
      if [[ "$INTERACTIVE" == "1" ]]; then pause; fi
      return 1
    fi
    read -r -s -p "Confirm new password: " confirm_password; echo
    if [[ "$new_password" != "$confirm_password" ]]; then
      err "Passwords do not match."
      if [[ "$INTERACTIVE" == "1" ]]; then pause; fi
      return 1
    fi
  fi

  if [[ -z "$new_username" && -z "$new_password" && -z "$new_displayname" ]]; then
    warn "Nothing to update."
    if [[ "$INTERACTIVE" == "1" ]]; then pause; fi
    return 0
  fi

  # Build the update object with bcrypt hash
  local js_update='const upd = {};'
  if [[ -n "$new_username" ]]; then
    js_update+="upd.username = '${new_username}';"
  fi
  if [[ -n "$new_displayname" ]]; then
    js_update+="upd.displayName = '${new_displayname}';"
  fi
  if [[ -n "$new_password" ]]; then
    # node bcrypt hash (mongosh does not have bcrypt; use node inline)
    local hashed
    hashed="$(node -e "const b=require('bcryptjs');b.hash('${new_password}',12).then(h=>console.log(h)).catch(()=>process.exit(1))" 2>/dev/null || true)"
    if [[ -z "$hashed" ]]; then
      err "Failed to hash password. Is bcryptjs available?"
      if [[ "$INTERACTIVE" == "1" ]]; then pause; fi
      return 1
    fi
    js_update+="upd.password = '${hashed}';"
  fi

  mongosh --quiet "$db_url" --eval "
    ${js_update}
    const res = db.User.updateOne({isSuperAdmin: true}, {'\$set': upd});
    print(res.modifiedCount === 1 ? 'ok' : 'notfound');
  " 2>/dev/null | grep -q "ok" \
    && ok "Superadmin credentials updated successfully." \
    || err "Update failed. Check mongosh connection and database name."

  if [[ "$INTERACTIVE" == "1" ]]; then pause; fi
}

uninstall_app() {

  header
  echo "Uninstall ${APP_NAME}"
  line 62 "-"
  echo "This will remove the app, service, nginx config, launcher, and config files."
  echo

  local confirm keep_files wipe_db
  if [[ "$INTERACTIVE" == "1" ]]; then
    read -r -p "Type UNINSTALL to continue: " confirm
    if [[ "$confirm" != "UNINSTALL" ]]; then
      warn "Cancelled"
      pause
      return
    fi
    read -r -p "Also DELETE the app directory (${APP_DIR})? [Y/n]: " keep_files
    read -r -p "Also DROP the MongoDB database? WARNING: all chat data will be lost! [y/N]: " wipe_db
  else
    if [[ "${FELFEL_FORCE_UNINSTALL:-0}" != "1" ]]; then
      err "Non-interactive uninstall requires FELFEL_FORCE_UNINSTALL=1"
      exit 1
    fi
    keep_files="n"
    wipe_db="${FELFEL_WIPE_DB:-n}"
  fi

  # ── 1. Stop and kill ALL running app processes ─────────────────────
  if [[ "$(runtime_controller)" == "systemd" ]]; then
    as_root systemctl stop "${SERVICE_NAME}.service" 2>/dev/null || true
    as_root systemctl disable "${SERVICE_NAME}.service" 2>/dev/null || true
  fi

  if [[ -f "$PID_FILE" ]]; then
    local pid
    pid="$(cat "$PID_FILE" 2>/dev/null || true)"
    if [[ -n "$pid" ]]; then kill -9 "$pid" 2>/dev/null || true; fi
    rm -f "$PID_FILE"
  fi

  local orphan_pids
  mapfile -t orphan_pids < <(
    pgrep -f "node server\.mjs" 2>/dev/null || true
    pgrep -f "npm run start" 2>/dev/null | grep -v "^$$" || true
  )
  for p in "${orphan_pids[@]}"; do
    [[ -n "$p" ]] || continue
    kill -9 "$p" 2>/dev/null || true
  done
  ok "All app processes stopped"

  # ── 2. Remove systemd service ─────────────────────────────────────
  local service_file="/etc/systemd/system/${SERVICE_NAME}.service"
  if [[ -f "$service_file" ]]; then
    as_root rm -f "$service_file"
    as_root systemctl daemon-reload 2>/dev/null || true
    ok "Removed systemd service: ${SERVICE_NAME}.service"
  fi

  # ── 3. Remove nginx vhost ─────────────────────────────────────────
  local nginx_removed="0"
  for conf in \
    "/etc/nginx/sites-available/felfelchat.conf" \
    "/etc/nginx/sites-enabled/felfelchat.conf" \
    "/etc/nginx/conf.d/felfelchat.conf"; do
    if [[ -f "$conf" ]]; then
      as_root rm -f "$conf"
      nginx_removed="1"
    fi
  done
  if [[ "$nginx_removed" == "1" ]]; then
    as_root nginx -t 2>/dev/null && as_root systemctl reload nginx 2>/dev/null || true
    ok "Removed nginx vhost config"
  fi

  # ── 4. Remove stale MongoDB apt repo files ────────────────────────
  for f in /etc/apt/sources.list.d/mongodb-org-*.list; do
    [[ -f "$f" ]] || continue
    as_root rm -f "$f" 2>/dev/null || true
  done

  # ── 5. Optionally drop the MongoDB database ───────────────────────
  if [[ "${wipe_db:-n}" =~ ^[Yy]$ ]]; then
    if command -v mongosh >/dev/null 2>&1; then
      local db_url db_name
      db_url="$(load_env_value DATABASE_URL 2>/dev/null || true)"
      db_name="$(printf '%s' "$db_url" | sed -E 's|.*//[^/]+/([^?]+).*|\1|' || echo 'felfelchat')"
      db_name="${db_name:-felfelchat}"
      mongosh --quiet "$db_name" --eval 'db.dropDatabase()' 2>/dev/null \
        && ok "Dropped MongoDB database: ${db_name}" \
        || warn "Could not drop MongoDB database (may not exist)"
    else
      warn "mongosh not found — skipping database drop"
    fi
  fi

  # ── 6. Remove launcher, config ────────────────────────────────────
  remove_launcher

  if [[ -f "$CONFIG_FILE" ]]; then rm -f "$CONFIG_FILE"; fi
  if [[ -d "$CONFIG_DIR" ]] && [[ -z "$(ls -A "$CONFIG_DIR" 2>/dev/null)" ]]; then
    rmdir "$CONFIG_DIR" 2>/dev/null || true
  fi
  ok "Removed manager config"

  # ── 7. Remove app directory (optional) ───────────────────────────
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

  ok "Uninstall completed. All FelFel components removed."
  if [[ "$INTERACTIVE" == "1" ]]; then
    pause
  fi
}

ensure_nginx() {
  if command -v nginx >/dev/null 2>&1; then
    return
  fi
  log "nginx not found. Installing..."
  local mgr
  mgr="$(detect_pkg_manager)"
  case "$mgr" in
    apt) pkg_install "$mgr" nginx ;;
    dnf|yum) pkg_install "$mgr" nginx ;;
    apk) pkg_install "$mgr" nginx ;;
    pacman) pkg_install "$mgr" nginx ;;
    *)
      warn "Cannot auto-install nginx. Install it manually and re-run."
      return
      ;;
  esac
  if command -v systemctl >/dev/null 2>&1; then
    as_root systemctl enable --now nginx 2>/dev/null || true
  fi
  ok "nginx installed"
}

normalize_domain_input() {
  local raw="$1"
  raw="$(printf "%s" "$raw" | tr '[:upper:]' '[:lower:]' | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//; s#^https?://##; s#/.*$##; s/:.*$//')"
  raw="${raw%.}"
  printf "%s" "$raw"
}

build_turn_urls_for_domain() {
  local domain="$1"
  printf "turn:%s:3478?transport=udp,turn:%s:3478?transport=tcp,turns:%s:5349?transport=tcp" "$domain" "$domain" "$domain"
}

is_valid_domain() {
  local domain="$1"
  [[ "$domain" =~ ^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,62}$ ]]
}

extract_domain_from_origin() {
  local origin="$1"
  local extracted
  extracted="$(normalize_domain_input "$origin")"
  if is_valid_domain "$extracted"; then
    printf "%s" "$extracted"
  fi
}

resolve_nginx_paths() {
  NGINX_VHOST_PATH=""
  NGINX_ENABLE_PATH=""
  NGINX_DEFAULT_PATH=""
  local include_sites include_conf_d
  include_sites="0"
  include_conf_d="0"
  if [[ -f "/etc/nginx/nginx.conf" ]]; then
    if grep -Eq '^[[:space:]]*include[[:space:]]+/etc/nginx/sites-enabled/\*;.*$' /etc/nginx/nginx.conf; then
      include_sites="1"
    fi
    if grep -Eq '^[[:space:]]*include[[:space:]]+/etc/nginx/conf\.d/\*\.conf;.*$' /etc/nginx/nginx.conf; then
      include_conf_d="1"
    fi
  fi
  if [[ "$include_sites" == "1" ]] && [[ -d "/etc/nginx/sites-available" ]] && [[ -d "/etc/nginx/sites-enabled" ]]; then
    NGINX_VHOST_PATH="/etc/nginx/sites-available/felfelchat.conf"
    NGINX_ENABLE_PATH="/etc/nginx/sites-enabled/felfelchat.conf"
    NGINX_DEFAULT_PATH="/etc/nginx/sites-enabled/default"
    return
  fi
  if [[ "$include_conf_d" == "1" ]]; then
    NGINX_VHOST_PATH="/etc/nginx/conf.d/felfelchat.conf"
    NGINX_ENABLE_PATH=""
    if [[ -f "/etc/nginx/conf.d/default.conf" ]]; then
      NGINX_DEFAULT_PATH="/etc/nginx/conf.d/default.conf"
    fi
    return
  fi
  if [[ -d "/etc/nginx/sites-available" ]] && [[ -d "/etc/nginx/sites-enabled" ]]; then
    NGINX_VHOST_PATH="/etc/nginx/sites-available/felfelchat.conf"
    NGINX_ENABLE_PATH="/etc/nginx/sites-enabled/felfelchat.conf"
    NGINX_DEFAULT_PATH="/etc/nginx/sites-enabled/default"
    return
  fi
  NGINX_VHOST_PATH="/etc/nginx/conf.d/felfelchat.conf"
  NGINX_ENABLE_PATH=""
  if [[ -f "/etc/nginx/conf.d/default.conf" ]]; then
    NGINX_DEFAULT_PATH="/etc/nginx/conf.d/default.conf"
  fi
}

write_file_with_optional_sudo() {
  local source_path="$1"
  local target_path="$2"
  local target_dir
  target_dir="$(dirname "$target_path")"
  if mkdir -p "$target_dir" 2>/dev/null && cp "$source_path" "$target_path" 2>/dev/null; then
    return 0
  fi
  if command -v sudo >/dev/null 2>&1; then
    sudo mkdir -p "$target_dir"
    sudo cp "$source_path" "$target_path"
    return 0
  fi
  return 1
}

link_file_with_optional_sudo() {
  local source_path="$1"
  local link_path="$2"
  [[ -n "$link_path" ]] || return 0
  if ln -sf "$source_path" "$link_path" 2>/dev/null; then
    return 0
  fi
  if command -v sudo >/dev/null 2>&1; then
    sudo ln -sf "$source_path" "$link_path"
    return 0
  fi
  return 1
}

remove_file_with_optional_sudo() {
  local target_path="$1"
  [[ -e "$target_path" ]] || return 0
  if rm -f "$target_path" 2>/dev/null; then
    return 0
  fi
  if command -v sudo >/dev/null 2>&1; then
    sudo rm -f "$target_path"
    return 0
  fi
  return 1
}

reload_nginx_service() {
  local use_sudo="$1"
  if [[ "$use_sudo" == "1" ]]; then
    sudo nginx -t >/dev/null 2>&1 || return 1
    if command -v systemctl >/dev/null 2>&1; then
      sudo systemctl reload nginx >/dev/null 2>&1 && return 0
      sudo systemctl restart nginx >/dev/null 2>&1 && return 0
    fi
    if command -v service >/dev/null 2>&1; then
      sudo service nginx reload >/dev/null 2>&1 && return 0
      sudo service nginx restart >/dev/null 2>&1 && return 0
    fi
    return 1
  fi
  nginx -t >/dev/null 2>&1 || return 1
  if command -v systemctl >/dev/null 2>&1; then
    systemctl reload nginx >/dev/null 2>&1 && return 0
    systemctl restart nginx >/dev/null 2>&1 && return 0
  fi
  if command -v service >/dev/null 2>&1; then
    service nginx reload >/dev/null 2>&1 && return 0
    service nginx restart >/dev/null 2>&1 && return 0
  fi
  return 1
}

ensure_certbot_webroot() {
  local use_sudo="$1"
  if [[ "$use_sudo" == "1" ]]; then
    sudo mkdir -p "/var/www/certbot"
  else
    mkdir -p "/var/www/certbot"
  fi
}

write_nginx_http_proxy_vhost() {
  local target_path="$1"
  local domain="$2"
  local port="$3"
  local write_tmp
  write_tmp="$(mktemp)"
  cat >"$write_tmp" <<NGINX_CONF
server {
    listen 80;
    server_name ${domain};

    client_max_body_size 25M;

    location ^~ /.well-known/acme-challenge/ {
        root /var/www/certbot;
        try_files \$uri =404;
    }

    location ^~ /socket.io/ {
        proxy_pass http://127.0.0.1:${port}/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 3600;
        proxy_send_timeout 3600;
        proxy_buffering off;
    }

    location / {
        proxy_pass http://127.0.0.1:${port};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGINX_CONF
  if ! write_file_with_optional_sudo "$write_tmp" "$target_path"; then
    rm -f "$write_tmp"
    return 1
  fi
  rm -f "$write_tmp"
  return 0
}

write_nginx_https_proxy_vhost() {
  local target_path="$1"
  local domain="$2"
  local port="$3"
  local write_tmp
  write_tmp="$(mktemp)"
  cat >"$write_tmp" <<NGINX_CONF
server {
    listen 80;
    server_name ${domain};

    location ^~ /.well-known/acme-challenge/ {
        root /var/www/certbot;
        try_files \$uri =404;
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}

server {
    listen 443 ssl;
    server_name ${domain};

    ssl_certificate /etc/letsencrypt/live/${domain}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${domain}/privkey.pem;

    client_max_body_size 25M;

    location ^~ /socket.io/ {
        proxy_pass http://127.0.0.1:${port}/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 3600;
        proxy_send_timeout 3600;
        proxy_buffering off;
    }

    location / {
        proxy_pass http://127.0.0.1:${port};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGINX_CONF
  if ! write_file_with_optional_sudo "$write_tmp" "$target_path"; then
    rm -f "$write_tmp"
    return 1
  fi
  rm -f "$write_tmp"
  return 0
}

setup_nginx_vhost() {
  local port domain_raw domain vhost_path sites_enabled default_conf current_origin current_domain
  local server_ip use_sudo certbot_email
  port="$(load_env_value PORT)"; [[ -n "$port" ]] || port="3000"
  server_ip="$(curl -4 -s --connect-timeout 5 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')"
  current_origin="$(load_env_value APP_ORIGIN)"
  current_domain="$(extract_domain_from_origin "$current_origin")"

  while true; do
    if [[ "$INTERACTIVE" == "1" ]]; then
      echo
      printf "Domain or subdomain for FelFelChat (e.g. felfel.example.com)\n"
      if [[ -n "$current_domain" ]]; then
        read -r -p "Leave blank to use IP only (http://${server_ip}:${port}) [${current_domain}]: " domain_raw
        domain_raw="${domain_raw:-$current_domain}"
      else
        read -r -p "Leave blank to use IP only (http://${server_ip}:${port}): " domain_raw
      fi
    else
      domain_raw="${FELFEL_DOMAIN:-}"
    fi
    domain="$(normalize_domain_input "$domain_raw")"
    if [[ -z "$domain" ]]; then
      break
    fi
    if is_valid_domain "$domain"; then
      break
    fi
    warn "Invalid domain format: '${domain_raw}'"
    if [[ "$INTERACTIVE" != "1" ]]; then
      domain=""
      break
    fi
  done

  if [[ -z "$domain" ]]; then
    upsert_env "APP_ORIGIN" "http://${server_ip}:${port}"
    ok "APP_ORIGIN set to http://${server_ip}:${port}"
    return
  fi

  ensure_nginx

  if [[ "${EUID:-$(id -u)}" -ne 0 ]] && ! command -v sudo >/dev/null 2>&1; then
    warn "Cannot write nginx config (no sudo). Configure nginx manually."
    upsert_env "APP_ORIGIN" "http://${server_ip}:${port}"
    return
  fi

  resolve_nginx_paths
  vhost_path="$NGINX_VHOST_PATH"
  sites_enabled="$NGINX_ENABLE_PATH"
  default_conf="$NGINX_DEFAULT_PATH"
  use_sudo="0"
  if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
    use_sudo="1"
  fi

  if ! write_nginx_http_proxy_vhost "$vhost_path" "$domain" "$port"; then
    warn "Failed to write nginx config at ${vhost_path}"
    upsert_env "APP_ORIGIN" "http://${server_ip}:${port}"
    return
  fi

  if ! link_file_with_optional_sudo "$vhost_path" "$sites_enabled"; then
    warn "Failed to enable nginx config at ${sites_enabled}"
    return
  fi

  if [[ -n "$default_conf" ]] && [[ -f "$default_conf" ]]; then
    remove_file_with_optional_sudo "$default_conf" || warn "Could not remove default nginx config: ${default_conf}"
  fi

  if ! reload_nginx_service "$use_sudo"; then
    warn "nginx test/reload failed. Fix config and retry."
    return
  fi

  upsert_env "APP_ORIGIN" "http://${domain}"
  upsert_env "NEXT_PUBLIC_WEBRTC_TURN_URLS" "$(build_turn_urls_for_domain "$domain")"
  ok "nginx vhost configured for ${domain}"

  local get_ssl="Y"
  if [[ "$INTERACTIVE" == "1" ]]; then
    read -r -p "Enable HTTPS with Let's Encrypt (certbot)? [Y/n]: " get_ssl
  fi

  if [[ "${get_ssl:-Y}" =~ ^[Yy]$ ]]; then
    local certbot_success
    certbot_success="0"
    ensure_certbot_webroot "$use_sudo"
    if [[ "$INTERACTIVE" == "1" ]]; then
      read -r -p "Email for Let's Encrypt notifications (leave blank to use --register-unsafely-no-email): " certbot_email
    fi

    if ! command -v certbot >/dev/null 2>&1; then
      log "Installing certbot..."
      local mgr
      mgr="$(detect_pkg_manager)"
      case "$mgr" in
        apt)
          pkg_install "$mgr" certbot python3-certbot-nginx
          ;;
        dnf|yum)
          pkg_install "$mgr" certbot python3-certbot-nginx
          ;;
        apk)
          pkg_install "$mgr" certbot certbot-nginx
          ;;
        pacman)
          pkg_install "$mgr" certbot certbot-nginx
          ;;
        *)
          warn "Cannot auto-install certbot. Install manually and run: certbot certonly --webroot -w /var/www/certbot -d ${domain}"
          return
          ;;
      esac
    fi

    local certbot_args
    certbot_args=(certonly --webroot -w "/var/www/certbot" -d "$domain" --non-interactive --agree-tos --keep-until-expiring)
    if [[ -n "${certbot_email:-}" ]]; then
      certbot_args+=(--email "$certbot_email")
    else
      certbot_args+=(--register-unsafely-no-email)
    fi

    if [[ "$use_sudo" == "1" ]]; then
      if sudo certbot "${certbot_args[@]}"; then
        certbot_success="1"
      else
        warn "certbot failed. Checking for existing certificate files..."
      fi
    else
      if certbot "${certbot_args[@]}"; then
        certbot_success="1"
      else
        warn "certbot failed. Checking for existing certificate files..."
      fi
    fi

    if [[ -f "/etc/letsencrypt/live/${domain}/fullchain.pem" ]] && [[ -f "/etc/letsencrypt/live/${domain}/privkey.pem" ]]; then
      certbot_success="1"
    fi

    if [[ "$certbot_success" == "1" ]]; then
      if ! write_nginx_https_proxy_vhost "$vhost_path" "$domain" "$port"; then
        warn "SSL certificate exists but failed to write HTTPS nginx config."
        return
      fi
      if ! link_file_with_optional_sudo "$vhost_path" "$sites_enabled"; then
        warn "Failed to enable HTTPS nginx config at ${sites_enabled}"
        return
      fi
      if ! reload_nginx_service "$use_sudo"; then
        warn "Failed to reload nginx after HTTPS config update."
        return
      fi
      upsert_env "APP_ORIGIN" "https://${domain}"
      upsert_env "NEXT_PUBLIC_WEBRTC_TURN_URLS" "$(build_turn_urls_for_domain "$domain")"
      ok "SSL configured. APP_ORIGIN set to https://${domain}"
    else
      if [[ "$use_sudo" == "1" ]]; then
        warn "SSL not configured. Retry manually: sudo certbot certonly --webroot -w /var/www/certbot -d ${domain}"
      else
        warn "SSL not configured. Retry manually: certbot certonly --webroot -w /var/www/certbot -d ${domain}"
      fi
    fi
  fi
}

setup_nginx_vhost_tui() {
  header
  setup_nginx_vhost
  pause
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
  default_origin="http://felfel.example.com"

  echo "Welcome to ${APP_NAME} one-shot installer"
  echo
  install_dir="$(prompt_with_default "Install directory" "$default_dir")"
  APP_DIR="$install_dir"
  set_paths

  repo="$(prompt_with_default "Repository (owner/name or git URL)" "$DEFAULT_REPO")"
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
  cleanup_legacy_sqlite_artifacts
  if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
    local runtime_user
    runtime_user="$(default_runtime_user)"
    if [[ -n "$runtime_user" ]]; then
      chown -R "${runtime_user}:${runtime_user}" "${APP_DIR}" 2>/dev/null || true
    fi
  fi
  setup_env_interactive
  ensure_nginx
  setup_nginx_vhost
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
    /usr/bin/env bash "${APP_DIR}/install.sh" tui
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
  7) Full deploy (pull + install + db-sync + build + restart)
  8) Update source code only
  9) Setup wizard (.env/secrets/port/origin)
 10) Change port/origin

$(printf "%b" "$COLOR_BOLD")Backup$(printf "%b" "$COLOR_RESET")
 11) Create manual DB backup
 12) Restore manual DB backup

$(printf "%b" "$COLOR_BOLD")Tools$(printf "%b" "$COLOR_RESET")
 13) Install/repair 'felfel' launcher
 14) Setup/update nginx vhost + APP_ORIGIN
 15) Uninstall FelFel
 16) Change superadmin password/username
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
      14) setup_nginx_vhost_tui ;;
      15) uninstall_app ;;
      16) superadmin_change_credentials ;;
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
    superadmin) ensure_app_dir_for_tui; superadmin_change_credentials ;;
    *)
      err "Unknown mode: $mode"
      err "Usage: install.sh [install|tui|uninstall|superadmin]"
      exit 1
      ;;
  esac
}

main "$@"
