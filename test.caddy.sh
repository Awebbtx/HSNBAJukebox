#!/bin/bash
echo "=== CA cert endpoint ==="
code=$(curl -sk http://192.168.1.11/caddy-ca -o /dev/null -w "%{http_code}")
echo "HTTP status: $code"

echo ""
echo "=== HTTPS jukebox.local health ==="
result=$(curl -sk --resolve jukebox.local:443:192.168.1.11 https://jukebox.local/api/requests/health)
echo "$result"

echo ""
echo "=== HTTPS jukebox.local requests page ==="
code2=$(curl -sk --resolve jukebox.local:443:192.168.1.11 https://jukebox.local/requests -o /dev/null -w "%{http_code}")
echo "HTTP status: $code2"
