#!/bin/bash
echo "=== Admin login ==="
TOKEN=$(curl -sf -X POST http://127.0.0.1:3000/api/admin/session \
  -H "Content-Type: application/json" \
  -d '{"pin":"admin1234"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "FAIL: no token returned (wrong PIN or server error)"
  exit 1
fi
echo "Token: ${TOKEN:0:16}..."

echo ""
echo "=== Playback state ==="
curl -sf http://127.0.0.1:3000/api/admin/playback/state \
  -H "Authorization: Bearer $TOKEN"

echo ""
echo "=== Queue ==="
curl -sf http://127.0.0.1:3000/api/admin/queue \
  -H "Authorization: Bearer $TOKEN" | head -c 200

echo ""
echo "=== Modes ==="
curl -sf http://127.0.0.1:3000/api/admin/modes \
  -H "Authorization: Bearer $TOKEN"
echo ""
echo "=== DONE ==="
