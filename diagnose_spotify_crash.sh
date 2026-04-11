#!/bin/bash
set -euo pipefail

RPC='http://127.0.0.1:6680/mopidy/rpc'
LOG='/tmp/mopidy_fg.log'

systemctl stop mopidy || true
pkill -f '/usr/bin/mopidy --config' || true
rm -f "$LOG"

runuser -u mopidy -- env RUST_BACKTRACE=full GST_DEBUG=2 /usr/bin/mopidy --config /usr/share/mopidy/conf.d:/etc/mopidy/mopidy.conf >"$LOG" 2>&1 &
PID=$!

for i in $(seq 1 30); do
  if curl -sf "$RPC" -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":99,"method":"core.get_version","params":{}}' >/dev/null; then
    break
  fi
  sleep 1
done

curl -s "$RPC" -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"core.tracklist.clear","params":{}}' >/dev/null
curl -s "$RPC" -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":2,"method":"core.tracklist.add","params":{"uris":["spotify:track:6U4VqEHy4n5VeiH4pQPL24"]}}' >/dev/null
curl -s "$RPC" -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":3,"method":"core.playback.play","params":{}}' >/dev/null

sleep 6

if kill -0 "$PID" 2>/dev/null; then
  echo "foreground_status=running"
  kill "$PID" || true
  wait "$PID" || true
else
  echo "foreground_status=exited"
fi

systemctl start mopidy

echo "==== fg log tail ===="
tail -120 "$LOG"
