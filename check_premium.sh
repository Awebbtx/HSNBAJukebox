#!/bin/bash
TOKEN=$(curl -s -X POST https://auth.mopidy.com/spotify/token \
  -d 'grant_type=client_credentials' \
  -d 'client_id=803d3dc5-2ff9-4516-817d-56c6036b9d69' \
  -d 'client_secret=9HjOxc7OsJryqv9Lct-Qof_EqYjA50Yg0lyBgJZdORc=' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('access_token','ERROR:'+str(d)))")

echo "Token: $TOKEN"

curl -s "https://api.spotify.com/v1/me" \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('Product:', d.get('product','?')); print('Name:', d.get('display_name','?')); print('Error:', d.get('error','none'))"
