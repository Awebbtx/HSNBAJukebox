#!/bin/bash
set -e

echo "[1/6] Installing Caddy..."
apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl -q
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg 2>/dev/null
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
apt-get update -q && apt-get install -y caddy

echo "[2/6] Installing Avahi (mDNS)..."
apt-get install -y avahi-daemon avahi-utils libnss-mdns

echo "[3/6] Setting Avahi hostname to jukebox..."
sed -i 's/^#*host-name=.*/host-name=jukebox/' /etc/avahi/avahi-daemon.conf
grep -q '^host-name=' /etc/avahi/avahi-daemon.conf || echo 'host-name=jukebox' >> /etc/avahi/avahi-daemon.conf

echo "[4/6] Stopping nginx (Caddy takes over ports 80/443)..."
systemctl stop nginx || true
systemctl disable nginx || true

echo "[5/6] Deploying Caddyfile..."
cp /root/jukebox.Caddyfile /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile

echo "[6/6] Starting services..."
systemctl restart avahi-daemon
systemctl enable --now caddy
systemctl restart caddy
sleep 3
systemctl is-active caddy
systemctl is-active avahi-daemon

echo ""
echo "=== DONE ==="
echo "  HTTP:  http://jukebox.local  (redirects to HTTPS)"
echo "  HTTPS: https://jukebox.local/requests"
echo "  CA cert (trust once per phone): http://192.168.1.11/caddy-ca"
