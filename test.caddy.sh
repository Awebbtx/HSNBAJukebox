#!/bin/bash
HOST_IP="172.16.10.3"
HOST_NAME="jukebox.hsnba.org"

echo "=== HTTPS $HOST_NAME health ==="
result=$(curl -sk --resolve ${HOST_NAME}:443:${HOST_IP} https://${HOST_NAME}/api/requests/health)
echo "$result"

echo ""
echo "=== HTTPS $HOST_NAME requests page ==="
code2=$(curl -sk --resolve ${HOST_NAME}:443:${HOST_IP} https://${HOST_NAME}/requests -o /dev/null -w "%{http_code}")
echo "HTTP status: $code2"

echo ""
echo "=== HTTP -> HTTPS redirect ==="
code3=$(curl -sk --resolve ${HOST_NAME}:80:${HOST_IP} http://${HOST_NAME}/requests -o /dev/null -w "%{http_code}")
echo "HTTP status: $code3"
