#!/usr/bin/env bash
set -euo pipefail

# Proxmox host bootstrap for HSNBAJukebox.
# Creates the next available LXC, installs prerequisites, deploys app, and starts service.

REPO_URL="${REPO_URL:-https://github.com/Awebbtx/HSNBAJukebox.git}"
BRANCH="${BRANCH:-main}"
CTID="${CTID:-}"
HOSTNAME_PREFIX="${HOSTNAME_PREFIX:-jukebox}"
CORES="${CORES:-2}"
MEMORY_MB="${MEMORY_MB:-2048}"
SWAP_MB="${SWAP_MB:-512}"
DISK_GB="${DISK_GB:-8}"
BRIDGE="${BRIDGE:-vmbr0}"
IP_CIDR="${IP_CIDR:-dhcp}"
GATEWAY="${GATEWAY:-}"
TEMPLATE_STORAGE="${TEMPLATE_STORAGE:-}"
ROOTFS_STORAGE="${ROOTFS_STORAGE:-}"
DEBIAN_TEMPLATE="${DEBIAN_TEMPLATE:-}"
APP_DIR="${APP_DIR:-/opt/HSNBA}"
SERVICE_NAME="${SERVICE_NAME:-hsnba-jukebox}"

log() {
  printf '\n==> %s\n' "$1"
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || { echo "Missing required command: $1"; exit 1; }
}

require_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    echo "Run as root on Proxmox host."
    exit 1
  fi
}

pick_storage_by_content() {
  local content="$1"
  pvesm status --content "$content" 2>/dev/null | awk 'NR>1 && $2=="active" {print $1; exit}'
}

resolve_template_name() {
  local name
  if [[ -n "${DEBIAN_TEMPLATE}" ]]; then
    echo "${DEBIAN_TEMPLATE}"
    return
  fi

  name="$(pveam available --section system 2>/dev/null | awk '/debian-12-standard.*amd64/ {print $2}' | tail -n1)"
  if [[ -z "${name}" ]]; then
    echo "Unable to resolve Debian 12 template from pveam available output."
    exit 1
  fi
  echo "${name}"
}

ensure_template_downloaded() {
  local storage="$1"
  local template_name="$2"
  if pveam list "$storage" 2>/dev/null | awk '{print $2}' | grep -Fxq "$template_name"; then
    return
  fi

  log "Downloading template ${template_name} to ${storage}"
  pveam update
  pveam download "$storage" "$template_name"
}

create_container() {
  local ctid="$1"
  local hostname="$2"
  local template_ref="$3"
  local net0

  if [[ "${IP_CIDR}" == "dhcp" ]]; then
    net0="name=eth0,bridge=${BRIDGE},ip=dhcp"
  elif [[ -n "${GATEWAY}" ]]; then
    net0="name=eth0,bridge=${BRIDGE},ip=${IP_CIDR},gw=${GATEWAY}"
  else
    net0="name=eth0,bridge=${BRIDGE},ip=${IP_CIDR}"
  fi

  log "Creating container ${ctid} (${hostname})"
  pct create "$ctid" "$template_ref" \
    --hostname "$hostname" \
    --cores "$CORES" \
    --memory "$MEMORY_MB" \
    --swap "$SWAP_MB" \
    --rootfs "${ROOTFS_STORAGE}:${DISK_GB}" \
    --net0 "$net0" \
    --onboot 1 \
    --unprivileged 1 \
    --features nesting=1,keyctl=1
}

wait_for_ip() {
  local ctid="$1"
  local tries=30
  local ip=""

  while (( tries > 0 )); do
    ip="$(pct exec "$ctid" -- sh -lc 'hostname -I 2>/dev/null | awk "{print \$1}"' || true)"
    if [[ -n "${ip}" ]]; then
      echo "${ip}"
      return
    fi
    tries=$((tries - 1))
    sleep 2
  done

  echo ""
}

configure_container_app() {
  local ctid="$1"

  log "Installing prerequisites in CT ${ctid}"
  pct exec "$ctid" -- sh -lc '
    set -e
    export DEBIAN_FRONTEND=noninteractive
    apt-get update
    apt-get install -y ca-certificates curl gnupg git
    if ! command -v node >/dev/null 2>&1 || ! node -v | grep -q "^v2"; then
      install -d -m 0755 /etc/apt/keyrings
      curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
      echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
      apt-get update
      apt-get install -y nodejs
    fi
  '

  log "Deploying app in CT ${ctid}"
  pct exec "$ctid" -- sh -lc "
    set -e
    rm -rf '${APP_DIR}'
    git clone --depth 1 --branch '${BRANCH}' '${REPO_URL}' '${APP_DIR}'
    cd '${APP_DIR}'
    npm install --omit=dev --no-audit --no-fund
    if [ ! -f .env ]; then
      cp .env.example .env
    fi
  "

  local ct_ip
  ct_ip="$(wait_for_ip "$ctid")"
  if [[ -z "${ct_ip}" ]]; then
    ct_ip="localhost"
  fi

  log "Seeding default .env values"
  pct exec "$ctid" -- sh -lc "
    set -e
    cd '${APP_DIR}'
    sed -i 's|^BASE_URL=.*|BASE_URL=http://${ct_ip}:3000|' .env
    sed -i 's|^SPOTIFY_REDIRECT_URI=.*|SPOTIFY_REDIRECT_URI=http://${ct_ip}:3000/auth/callback|' .env
    sed -i 's|^MOPIDY_URL=.*|MOPIDY_URL=http://127.0.0.1:6680/mopidy/rpc|' .env
    grep -q '^ADMIN_BOOTSTRAP_PASSWORD=' .env || echo 'ADMIN_BOOTSTRAP_PASSWORD=admin1234' >> .env
  "

  log "Installing systemd service"
  pct exec "$ctid" -- sh -lc "
    set -e
    cp '${APP_DIR}/hsnba-jukebox.service' '/etc/systemd/system/${SERVICE_NAME}.service'
    systemctl daemon-reload
    systemctl enable --now '${SERVICE_NAME}.service'
    systemctl restart '${SERVICE_NAME}.service'
    systemctl is-active '${SERVICE_NAME}.service'
  "

  log "Container ${ctid} app bootstrap complete"
  if [[ "${ct_ip}" != "localhost" ]]; then
    echo "URL: http://${ct_ip}:3000"
  fi
}

main() {
  require_root
  require_cmd pct
  require_cmd pvesh
  require_cmd pvesm
  require_cmd pveam

  if [[ -z "${CTID}" ]]; then
    CTID="$(pvesh get /cluster/nextid)"
  fi

  if [[ -n "$(pct status "${CTID}" 2>/dev/null || true)" ]]; then
    echo "CTID ${CTID} already exists. Set CTID=<id> to target another one."
    exit 1
  fi

  if [[ -z "${TEMPLATE_STORAGE}" ]]; then
    TEMPLATE_STORAGE="$(pick_storage_by_content vztmpl)"
  fi
  if [[ -z "${ROOTFS_STORAGE}" ]]; then
    ROOTFS_STORAGE="$(pick_storage_by_content rootdir)"
  fi

  if [[ -z "${TEMPLATE_STORAGE}" || -z "${ROOTFS_STORAGE}" ]]; then
    echo "Could not auto-detect Proxmox storage pools. Set TEMPLATE_STORAGE and ROOTFS_STORAGE explicitly."
    exit 1
  fi

  local template_name
  template_name="$(resolve_template_name)"
  ensure_template_downloaded "$TEMPLATE_STORAGE" "$template_name"

  local template_ref
  template_ref="${TEMPLATE_STORAGE}:vztmpl/${template_name}"
  local hostname
  hostname="${HOSTNAME_PREFIX}-${CTID}"

  create_container "$CTID" "$hostname" "$template_ref"

  log "Starting CT ${CTID}"
  pct start "$CTID"

  configure_container_app "$CTID"

  echo ""
  echo "Done."
  echo "CTID: ${CTID}"
  echo "Hostname: ${hostname}"
  echo "Template storage: ${TEMPLATE_STORAGE}"
  echo "Rootfs storage: ${ROOTFS_STORAGE}"
}

main "$@"
