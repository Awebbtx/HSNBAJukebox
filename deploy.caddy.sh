#!/bin/bash
set -e

echo "[1/4] Installing Caddy..."
apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl -q
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg 2>/dev/null
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
apt-get update -q && apt-get install -y caddy

echo "[2/4] Stopping nginx (Caddy takes over ports 80/443)..."
systemctl stop nginx || true
systemctl disable nginx || true

echo "[3/4] Deploying Caddyfile..."
cp /root/jukebox.Caddyfile /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile

echo "[4/4] Starting Caddy..."
systemctl enable --now caddy
systemctl restart caddy
sleep 3
systemctl is-active caddy

echo ""
echo "=== DONE ==="
echo "  HTTP:  http://jukebox.hsnba.org  (redirects to HTTPS)"
echo "  HTTPS: https://jukebox.hsnba.org/requests"
