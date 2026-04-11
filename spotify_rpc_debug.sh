#!/bin/bash
set -euo pipefail
RPC=http://127.0.0.1:6680/mopidy/rpc

req(){
  local payload="$1"
  curl -s "$RPC" -H 'Content-Type: application/json' -d "$payload"
  echo
}

echo "clear:"; req '{"jsonrpc":"2.0","id":1,"method":"core.tracklist.clear","params":{}}'
echo "add:"; req '{"jsonrpc":"2.0","id":2,"method":"core.tracklist.add","params":{"uris":["spotify:track:6U4VqEHy4n5VeiH4pQPL24"]}}'
echo "len:"; req '{"jsonrpc":"2.0","id":5,"method":"core.tracklist.get_length","params":{}}'
echo "play:"; req '{"jsonrpc":"2.0","id":3,"method":"core.playback.play","params":{}}'
sleep 4
echo "state:"; req '{"jsonrpc":"2.0","id":4,"method":"core.playback.get_state","params":{}}'
echo "current:"; req '{"jsonrpc":"2.0","id":6,"method":"core.playback.get_current_track","params":{}}'
