#!/bin/bash
set -euo pipefail
CID="3067779f6b18410ca83da7548360c10c"
CSEC="cf3aff2d178d42238258915a81de8b88"
TOKEN=$(curl -s -X POST https://auth.mopidy.com/spotify/token \
  -d "grant_type=client_credentials" \
  -d "client_id=${CID}" \
  -d "client_secret=${CSEC}" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('access_token',''))")
if [ -z "$TOKEN" ]; then
  echo "token-fetch-failed"
  exit 1
fi
curl -s https://api.spotify.com/v1/me -H "Authorization: Bearer $TOKEN" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('id=',d.get('id')); print('display_name=',d.get('display_name')); print('product=',d.get('product')); print('error=',d.get('error'))"
