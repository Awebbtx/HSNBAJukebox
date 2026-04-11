#!/bin/bash
set -euo pipefail
conf=/etc/mopidy/mopidy.conf
cp "$conf" "${conf}.bak.manual"
python3 - <<'PY'
from pathlib import Path
p = Path('/etc/mopidy/mopidy.conf')
text = p.read_text()
lines = text.splitlines()
out = []
for line in lines:
    s = line.strip()
    if s.startswith('client_id ='):
        out.append('client_id = fe1ad290-8e10-4b27-9a8c-e40ffd4d26ee')
    elif s.startswith('client_secret ='):
        out.append('client_secret = mrvZbTmZwAI0hnpvgQ2h7LcbvifNbEVeEL2rYObUvwk=')
    else:
        out.append(line)
p.write_text('\n'.join(out) + '\n')
print('updated')
PY
grep -A5 '^\[spotify\]' "$conf"
