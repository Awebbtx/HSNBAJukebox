#!/bin/bash
cat >> /etc/mopidy/mopidy.conf << 'EOF'

[party]
enabled = true
EOF
echo "Done"
tail -5 /etc/mopidy/mopidy.conf
