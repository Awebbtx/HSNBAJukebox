#!/bin/bash
set -euo pipefail
cat > /etc/asound.conf << 'EOF'
pcm.!default {
  @args [ AES0 AES1 AES2 AES3 CARD DEV ]
  @args.AES0 { type integer default 0 }
  @args.AES1 { type integer default 0 }
  @args.AES2 { type integer default 0 }
  @args.AES3 { type integer default 0 }
  @args.CARD { type integer default 0 }
  @args.DEV { type integer default 0 }
  type plug
  slave {
    pcm {
      type hw
      card $CARD
      device $DEV
    }
  }
}

ctl.!default {
  type hw
  card 0
}
EOF

echo "wrote /etc/asound.conf"
cat /etc/asound.conf

echo "\nTesting AES-parameterized default device..."
speaker-test -D 'default:{AES0 0x02 AES1 0x82 AES2 0x00 AES3 0x02}' -c 2 -t sine -l 1 >/tmp/speaker_aes_test.log 2>&1 || true
tail -20 /tmp/speaker_aes_test.log
