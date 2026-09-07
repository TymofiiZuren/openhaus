#!/usr/bin/env bash
# Derive still-image sequences. No network calls, no overwritten media.
set -euo pipefail
cd "$(dirname "$0")/.."
for pack in coastal courtyard harbour; do
 output="apps/web/public/media-demo/$pack-study.mp4"
 if [[ -e "$output" ]]; then echo "Preserved existing $pack video"; continue; fi
 ffmpeg -n -loglevel error \
  -loop 1 -t 4 -i "apps/web/public/media-demo/$pack-exterior.jpg" \
  -loop 1 -t 4 -i "apps/web/public/media-demo/$pack-interior.jpg" \
  -filter_complex '[0:v]scale=1280:854,fps=24,format=yuv420p[a];[1:v]scale=1280:854,fps=24,format=yuv420p[b];[a][b]xfade=transition=fade:duration=1:offset=3[v]' \
  -map '[v]' -t 7 -c:v libx264 -crf 24 -movflags +faststart "$output"
done
