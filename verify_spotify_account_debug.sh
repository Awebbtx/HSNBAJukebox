#!/bin/bash
set -euo pipefail
CID="fe1ad290-8e10-4b27-9a8c-e40ffd4d26ee"
CSEC="mrvZbTmZwAI0hnpvgQ2h7LcbvifNbEVeEL2rYObUvwk="
RESP=$(curl -s -X POST https://auth.mopidy.com/spotify/token \
  -d "grant_type=client_credentials" \
  -d "client_id=${CID}" \
  -d "client_secret=${CSEC}")
echo "$RESP"
TOKEN=$(printf '%s' "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('access_token',''))")
echo "token_len=${#TOKEN}"
if [ -n "$TOKEN" ]; then
  curl -s https://api.spotify.com/v1/me -H "Authorization: Bearer $TOKEN"
fi
