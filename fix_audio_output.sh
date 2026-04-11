#!/bin/bash
set -euo pipefail
conf=/etc/mopidy/mopidy.conf
cp "$conf" "${conf}.bak.audiofix"
python3 - <<'PY'
from pathlib import Path
p = Path('/etc/mopidy/mopidy.conf')
lines = p.read_text().splitlines()
out = []
for ln in lines:
    if ln.strip().startswith('output ='):
        out.append('output = audioresample ! audioconvert ! alsasink')
    else:
        out.append(ln)
p.write_text('\n'.join(out) + '\n')
print('updated')
PY
grep -A4 '^\[audio\]' "$conf"
systemctl restart mopidy
sleep 3
systemctl is-active mopidy
