#!/bin/bash
cat >> /etc/mopidy/mopidy.conf << 'EOF'

[youtube]
enabled = true
allow_cache = true
youtube_dl_package = yt_dlp
autoplay_enabled = false
EOF
echo "Done"
tail -10 /etc/mopidy/mopidy.conf
