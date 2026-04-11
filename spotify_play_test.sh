#!/bin/bash
set -euo pipefail
RPC=http://127.0.0.1:6680/mopidy/rpc
curl -s "$RPC" -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"core.tracklist.clear","params":{}}' >/dev/null
curl -s "$RPC" -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":2,"method":"core.tracklist.add","params":{"uris":["spotify:track:6U4VqEHy4n5VeiH4pQPL24"]}}' >/dev/null
curl -s "$RPC" -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":3,"method":"core.playback.play","params":{}}' >/dev/null
sleep 6
echo "service=$(systemctl is-active mopidy)"
curl -s "$RPC" -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":4,"method":"core.playback.get_state","params":{}}'
echo
journalctl -u mopidy --no-pager -n 60 2>&1 | grep -i -e 'Main process exited' -e failure -e source-setup -e GST_STATE_PLAYING -e spotify | tail -30
